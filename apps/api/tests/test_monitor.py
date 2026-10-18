import asyncio

import pytest

from app.frames import FrameStore
from app.monitor import CameraMonitor, CameraState, MonitorConfig, WatchManager, monitor_key
from app.source import UNCHANGED, Fetched, FetchError

JPEG = b"\xff\xd8\xff"


class FakeFetcher:
    """Returns queued results; when the queue is empty, reports 'unchanged'."""

    def __init__(self, results=None):
        self.results = list(results or [])
        self.calls = 0

    async def fetch(self, camera_id, last_modified=None, last_sha256=None):
        self.calls += 1
        if self.results:
            r = self.results.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        return UNCHANGED


def new_frame(i: int) -> Fetched:
    data = JPEG + bytes([i])
    return Fetched(
        changed=True, data=data, last_modified=f"lm{i}", captured_epoch=1000 + i, sha256=f"{i:064d}"
    )


class Recorder:
    def __init__(self):
        self.messages = []

    async def send_json(self, data):
        self.messages.append(data)


async def analyse_ok(frame):
    return {
        "type": "analysis",
        "cameraId": frame.camera_id,
        "frameId": frame.frame_id,
        "status": "ok",
    }


def make_monitor(tmp_path, fetcher, analyze=analyse_ok, emitted=None, config=None):
    async def emit(camera_id, msg):
        if emitted is not None:
            emitted.append(msg)

    return CameraMonitor(
        "47",
        fetcher,
        FrameStore(tmp_path, 20),
        analyze,
        emit,
        CameraState(),
        config or MonitorConfig(poll_interval=0.01, max_backoff=0.05),
    )


async def wait_for(predicate, timeout=2.0):
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while not predicate():
        if loop.time() > end:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.005)


@pytest.fixture
def manager_factory(tmp_path):
    created = []

    def factory(fetcher_results=None):
        def monitor_factory(camera_id, token, state, emit):
            m = CameraMonitor(
                camera_id,
                FakeFetcher(fetcher_results),
                FrameStore(tmp_path, 20),
                analyse_ok,
                emit,
                state,
                MonitorConfig(poll_interval=0.01),
            )
            created.append(m)
            return m

        return WatchManager(monitor_factory), created

    return factory


async def test_two_subscribers_share_one_monitor(manager_factory):
    manager, created = manager_factory([new_frame(1)])
    a, b = Recorder(), Recorder()
    await manager.set_subscriptions(a, {"47"})
    await manager.set_subscriptions(b, {"47"})
    assert len(created) == 1 and manager.watchers(monitor_key("47", None)) == 2
    await wait_for(lambda: any(m["type"] == "analysis" for m in b.messages))
    assert [m["type"] for m in a.messages] == [m["type"] for m in b.messages]
    await manager.shutdown()


async def test_monitor_stops_after_last_unsubscribe(manager_factory):
    manager, created = manager_factory()
    a, b = Recorder(), Recorder()
    await manager.set_subscriptions(a, {"47", "04"})
    await manager.set_subscriptions(b, {"47"})
    await manager.set_subscriptions(a, {"04"})  # a drops 47, b still watches it
    assert monitor_key("47", None) in manager.monitors
    await manager.disconnect(b)
    assert monitor_key("47", None) not in manager.monitors
    stopped = next(m for m in created if m.camera_id == "47")
    assert not stopped.running
    calls = stopped._fetcher.calls
    await asyncio.sleep(0.05)
    assert stopped._fetcher.calls == calls  # no more polling
    await manager.disconnect(a)
    assert manager.monitors == {}


async def test_last_disconnect_clears_session_state(manager_factory):
    manager, _ = manager_factory([new_frame(1)])
    a = Recorder()
    await manager.set_subscriptions(a, {"47"})
    await wait_for(lambda: any(m["type"] == "analysis" for m in a.messages))
    await manager.disconnect(a)
    assert manager.replay("47") == []


async def test_different_keys_have_isolated_analyses(tmp_path):
    created = []

    def monitor_factory(camera_id, token, state, emit):
        async def analyse(frame):
            return {"type": "analysis", "cameraId": camera_id, "keyLabel": token}

        monitor = CameraMonitor(
            camera_id,
            FakeFetcher([new_frame(1)]),
            FrameStore(tmp_path, 20),
            analyse,
            emit,
            state,
            MonitorConfig(poll_interval=0.01),
        )
        created.append(monitor)
        return monitor

    manager = WatchManager(monitor_factory)
    a, b = Recorder(), Recorder()
    await manager.set_subscriptions(a, {"47"}, "key-a")
    await manager.set_subscriptions(b, {"47"}, "key-b")
    await wait_for(lambda: any(m["type"] == "analysis" for m in a.messages))
    await wait_for(lambda: any(m["type"] == "analysis" for m in b.messages))
    assert len(created) == 2
    assert [m["keyLabel"] for m in a.messages if m["type"] == "analysis"] == ["key-a"]
    assert [m["keyLabel"] for m in b.messages if m["type"] == "analysis"] == ["key-b"]
    await manager.set_subscriptions(a, {"47"}, "key-b")
    assert monitor_key("47", "key-a") not in manager.monitors
    assert manager.watchers(monitor_key("47", "key-b")) == 2
    await manager.shutdown()


async def test_intermediate_frames_skipped_while_analysis_slow(tmp_path):
    gate = asyncio.Event()
    analysed = []

    async def slow_analyse(frame):
        analysed.append(frame.frame_id)
        if len(analysed) == 1:
            await gate.wait()
        return {"type": "analysis", "frameId": frame.frame_id}

    fetcher = FakeFetcher()
    monitor = make_monitor(tmp_path, fetcher, analyze=slow_analyse)
    monitor.start()
    fetcher.results.append(new_frame(1))
    await wait_for(lambda: len(analysed) == 1)
    fetcher.results.extend([new_frame(2), new_frame(3)])
    await wait_for(lambda: not fetcher.results)
    await asyncio.sleep(0.03)
    gate.set()
    await wait_for(lambda: len(analysed) == 2)
    await asyncio.sleep(0.03)
    await monitor.stop()
    assert analysed[0].startswith("1001-")
    assert analysed[1].startswith("1003-")  # frame 2 skipped
    assert len(analysed) == 2


async def test_offline_after_three_failures_and_recovery(tmp_path):
    emitted = []
    fetcher = FakeFetcher([FetchError("down")] * 3 + [new_frame(1)])
    monitor = make_monitor(tmp_path, fetcher, emitted=emitted)
    for _ in range(2):
        await monitor.poll_once()
    assert emitted == []
    await monitor.poll_once()
    assert emitted[-1] == {
        "type": "camera_status",
        "cameraId": "47",
        "online": False,
        "lastError": "down",
    }
    await monitor.poll_once()
    assert emitted[-2] == {"type": "camera_status", "cameraId": "47", "online": True}
    assert emitted[-1]["type"] == "frame"


async def test_exponential_backoff_capped(tmp_path):
    monitor = make_monitor(
        tmp_path, FakeFetcher(), config=MonitorConfig(poll_interval=5, max_backoff=60)
    )
    delays = []
    for failures in range(0, 7):
        monitor.failures = failures
        delays.append(monitor.next_delay())
    assert delays == [5, 5, 10, 20, 40, 60, 60]


async def test_analysis_crash_reports_unavailable(tmp_path):
    emitted = []

    async def boom(frame):
        raise RuntimeError("model exploded")

    monitor = make_monitor(tmp_path, FakeFetcher([new_frame(1)]), analyze=boom, emitted=emitted)
    monitor.start()
    await wait_for(lambda: any(m["type"] == "analysis" for m in emitted))
    await monitor.stop()
    analysis = next(m for m in emitted if m["type"] == "analysis")
    assert analysis["status"] == "analysis_unavailable"
    assert analysis["totalAvailable"] is None
