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
import hashlib
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
        forget_detections: Callable[[str], None] | None = None,
    ) -> None:
        self.camera_id = camera_id
        self._fetcher = fetcher
        self._store = store
        self._analyze = analyze
        self._emit = emit
        self.state = state
        self._config = config
        self._forget_detections = forget_detections
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

    def requeue_latest(self, fresh: bool = False) -> bool:
        """Re-analyse the latest frame (e.g. after its views or zones changed).

        Returns False when there is no frame yet. A frame already waiting is analysed anyway.
        """
        if fresh and self._forget_detections:
            self._forget_detections(self.camera_id)
        if self._last_frame is None:
            return False
        if self._pending is None:
            self._pending = self._last_frame
            self._wakeup.set()
        return True

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


MonitorKey = tuple[str, str]
MonitorFactory = Callable[[str, str | None, CameraState, Emit], CameraMonitor]


def monitor_key(camera_id: str, token: str | None) -> MonitorKey:
    return camera_id, hashlib.sha256((token or "").encode()).hexdigest()


@dataclass
class WatchManager:
    monitor_factory: MonitorFactory
    subscriptions: dict[Connection, set[MonitorKey]] = field(default_factory=dict)
    monitors: dict[MonitorKey, CameraMonitor] = field(default_factory=dict)
    states: dict[MonitorKey, CameraState] = field(default_factory=dict)

    def watchers(self, key: MonitorKey) -> int:
        return sum(key in cams for cams in self.subscriptions.values())

    async def set_subscriptions(
        self, conn: Connection, cameras: set[str], token: str | None = None
    ) -> set[str]:
        """Replace a connection's subscription set. Returns the newly added cameras."""
        previous = self.subscriptions.get(conn, set())
        next_keys = {monitor_key(camera_id, token) for camera_id in cameras}
        self.subscriptions[conn] = next_keys
        added, removed = next_keys - previous, previous - next_keys
        for key in added:
            if key not in self.monitors:
                state = self.states.setdefault(key, CameraState())

                async def emit(_camera_id: str, message: Message, key: MonitorKey = key) -> None:
                    await self.broadcast(key, message)

                monitor = self.monitor_factory(key[0], token, state, emit)
                self.monitors[key] = monitor
                monitor.start()
        for key in removed:
            await self._maybe_stop(key)
        return {camera_id for camera_id, _ in added}

    async def disconnect(self, conn: Connection) -> None:
        for key in self.subscriptions.pop(conn, set()):
            await self._maybe_stop(key)

    async def _maybe_stop(self, key: MonitorKey) -> None:
        if self.watchers(key) == 0 and key in self.monitors:
            await self.monitors.pop(key).stop()
            self.states.pop(key, None)

    def replay(self, camera_id: str, token: str | None = None) -> list[Message]:
        state = self.states.get(monitor_key(camera_id, token))
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

    async def broadcast(self, key: MonitorKey, message: Message) -> None:
        targets = [c for c, keys in self.subscriptions.items() if key in keys]
        for conn in targets:
            try:
                await conn.send_json(message)
            except Exception:  # a dead socket is cleaned up by its own handler
                log.debug("send to subscriber failed", exc_info=True)

    def requeue(self, camera_id: str, token: str | None = None, fresh: bool = False) -> bool:
        """Re-analyse a watched camera's latest frame; False if it is not being monitored."""
        monitor = self.monitors.get(monitor_key(camera_id, token))
        return monitor is not None and monitor.requeue_latest(fresh)

    def requeue_all(self, camera_id: str) -> None:
        for key, monitor in self.monitors.items():
            if key[0] == camera_id:
                monitor.requeue_latest()

    async def shutdown(self) -> None:
        for monitor in list(self.monitors.values()):
            await monitor.stop()
        self.monitors.clear()
