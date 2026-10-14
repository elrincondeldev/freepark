"""Watch-driven camera monitoring.

`WatchManager` ref-counts subscribers per camera and runs exactly one
`CameraMonitor` per watched camera. A monitor polls the source, stores new
frames, broadcasts them, and feeds a latest-wins slot consumed by a single
analysis worker, so at most one analysis per camera is in flight and
intermediate frames are skipped.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from app.frames import FrameStore, make_frame_id
from app.source import FetchError, SourceFetcher

log = logging.getLogger(__name__)

Message = dict[str, Any]


@dataclass(frozen=True)
class FrameInfo:
    camera_id: str
    frame_id: str
    captured_at: str
    data: bytes


Analyzer = Callable[[FrameInfo], Awaitable[Message]]
Emit = Callable[[str, Message], Awaitable[None]]


@dataclass
class CameraState:
    """Per-camera state kept across monitor restarts (dedupe + replay)."""

    last_modified: str | None = None
    sha256: str | None = None
    frame_msg: Message | None = None
    analysis_msg: Message | None = None
    online: bool = True
    last_error: str | None = None


def frame_message(frame: FrameInfo) -> Message:
    return {
        "type": "frame",
        "cameraId": frame.camera_id,
        "frameId": frame.frame_id,
        "capturedAt": frame.captured_at,
        "url": f"/api/cameras/{frame.camera_id}/frames/{frame.frame_id}.jpg",
    }


def status_message(camera_id: str, state: CameraState) -> Message:
    msg: Message = {"type": "camera_status", "cameraId": camera_id, "online": state.online}
    if state.last_error:
        msg["lastError"] = state.last_error
    return msg


@dataclass
class MonitorConfig:
    poll_interval: float = 5.0
    max_backoff: float = 60.0
    offline_after_failures: int = 3


class CameraMonitor:
    def __init__(
        self,
        camera_id: str,
        fetcher: SourceFetcher,
        store: FrameStore,
        analyze: Analyzer,
        emit: Emit,
        state: CameraState,
        config: MonitorConfig,
    ) -> None:
        self.camera_id = camera_id
        self._fetcher = fetcher
        self._store = store
        self._analyze = analyze
        self._emit = emit
        self.state = state
        self._config = config
        self._pending: FrameInfo | None = None
        self._wakeup = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []
        self.failures = 0
        self.polls = 0
        self._last_frame: FrameInfo | None = None

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._poll_loop(), name=f"poll-{self.camera_id}"),
            asyncio.create_task(self._analysis_loop(), name=f"analyse-{self.camera_id}"),
        ]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks = []

    @property
    def running(self) -> bool:
        return any(not t.done() for t in self._tasks)

    def next_delay(self) -> float:
        if self.failures == 0:
            return self._config.poll_interval
        return min(self._config.poll_interval * 2 ** (self.failures - 1), self._config.max_backoff)

    async def poll_once(self) -> None:
        self.polls += 1
        try:
            fetched = await self._fetcher.fetch(
                self.camera_id, self.state.last_modified, self.state.sha256
            )
        except FetchError as exc:
            self.failures += 1
            self.state.last_error = str(exc)
            log.info("camera %s fetch failed (%d): %s", self.camera_id, self.failures, exc)
            if self.failures >= self._config.offline_after_failures and self.state.online:
                self.state.online = False
                await self._emit(self.camera_id, status_message(self.camera_id, self.state))
            return

        self.failures = 0
        if not self.state.online:
            self.state.online = True
            self.state.last_error = None
            await self._emit(self.camera_id, status_message(self.camera_id, self.state))
        if not fetched.changed:
            return

        self.state.last_modified = fetched.last_modified
        self.state.sha256 = fetched.sha256
        frame_id = make_frame_id(fetched.captured_epoch, fetched.data)
        await asyncio.to_thread(self._store.save, self.camera_id, frame_id, fetched.data)
        frame = FrameInfo(
            camera_id=self.camera_id,
            frame_id=frame_id,
            captured_at=datetime.fromtimestamp(fetched.captured_epoch, UTC).isoformat(),
            data=fetched.data,
        )
        self.state.frame_msg = frame_message(frame)
        await self._emit(self.camera_id, self.state.frame_msg)
        self._last_frame = frame
        self._pending = frame  # latest wins: overwrite any frame not yet analysed
        self._wakeup.set()

    def requeue_latest(self) -> None:
        """Re-analyse the latest frame (e.g. after its views or zones changed)."""
        if self._last_frame is not None and self._pending is None:
            self._pending = self._last_frame
            self._wakeup.set()

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except Exception:  # never let one bad poll kill monitoring
                log.exception("camera %s poll crashed", self.camera_id)
                self.failures += 1
            await asyncio.sleep(self.next_delay())

    async def _analysis_loop(self) -> None:
        while True:
            await self._wakeup.wait()
            self._wakeup.clear()
            frame, self._pending = self._pending, None
            if frame is None:
                continue
            try:
                result = await self._analyze(frame)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("camera %s analysis crashed", self.camera_id)
                result = {
                    "type": "analysis",
                    "cameraId": frame.camera_id,
                    "frameId": frame.frame_id,
                    "status": "analysis_unavailable",
                    "viewId": None,
                    "viewConfidence": None,
                    "vehicles": [],
                    "zones": [],
                    "totalAvailable": None,
                }
            self.state.analysis_msg = result
            await self._emit(self.camera_id, result)


class Connection(Protocol):
    async def send_json(self, data: Any) -> None: ...


MonitorFactory = Callable[[str, CameraState, Emit], CameraMonitor]


@dataclass
class WatchManager:
    monitor_factory: MonitorFactory
    subscriptions: dict[Connection, set[str]] = field(default_factory=dict)
    monitors: dict[str, CameraMonitor] = field(default_factory=dict)
    states: dict[str, CameraState] = field(default_factory=dict)

    def watchers(self, camera_id: str) -> int:
        return sum(camera_id in cams for cams in self.subscriptions.values())

    async def set_subscriptions(self, conn: Connection, cameras: set[str]) -> set[str]:
        """Replace a connection's subscription set. Returns the newly added cameras."""
        previous = self.subscriptions.get(conn, set())
        self.subscriptions[conn] = set(cameras)
        added, removed = cameras - previous, previous - cameras
        for camera_id in added:
            if camera_id not in self.monitors:
                state = self.states.setdefault(camera_id, CameraState())
                monitor = self.monitor_factory(camera_id, state, self.broadcast)
                self.monitors[camera_id] = monitor
                monitor.start()
        for camera_id in removed:
            await self._maybe_stop(camera_id)
        return added

    async def disconnect(self, conn: Connection) -> None:
        cameras = self.subscriptions.pop(conn, set())
        for camera_id in cameras:
            await self._maybe_stop(camera_id)

    async def _maybe_stop(self, camera_id: str) -> None:
        if self.watchers(camera_id) == 0 and camera_id in self.monitors:
            await self.monitors.pop(camera_id).stop()

    def replay(self, camera_id: str) -> list[Message]:
        state = self.states.get(camera_id)
        if state is None:
            return []
        msgs: list[Message] = []
        if not state.online:
            msgs.append(status_message(camera_id, state))
        if state.frame_msg:
            msgs.append(state.frame_msg)
        if state.analysis_msg:
            msgs.append(state.analysis_msg)
        return msgs

    async def broadcast(self, camera_id: str, message: Message) -> None:
        targets = [c for c, cams in self.subscriptions.items() if camera_id in cams]
        for conn in targets:
            try:
                await conn.send_json(message)
            except Exception:  # a dead socket is cleaned up by its own handler
                log.debug("send to subscriber failed", exc_info=True)

    def requeue(self, camera_id: str) -> None:
        monitor = self.monitors.get(camera_id)
        if monitor is not None:
            monitor.requeue_latest()

    async def shutdown(self) -> None:
        for monitor in list(self.monitors.values()):
            await monitor.stop()
        self.monitors.clear()
