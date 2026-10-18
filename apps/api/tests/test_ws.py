import time

import respx
from fastapi.testclient import TestClient

from app import main as app_main
from app.detection import Detection
from app.monitor import monitor_key
from tests.fixtures import frame_bytes

JPEG = frame_bytes("47_1791962972.jpg")
LM = "Wed, 14 Oct 2026 07:17:51 GMT"


def receive_until(ws, type_, limit=10):
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["type"] == type_:
            return msg
    raise AssertionError(f"no {type_} message")


@respx.mock
def test_subscribe_receives_frame_and_analysis(client):
    route = respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "cameras": ["47", "4x"]})
        assert ws.receive_json() == {"type": "subscribed", "cameras": ["47"]}
        frame = receive_until(ws, "frame")
        assert frame["cameraId"] == "47" and frame["url"].endswith(".jpg")
        assert client.get(frame["url"]).status_code == 200
        analysis = receive_until(ws, "analysis")
        assert analysis["frameId"] == frame["frameId"]
        assert analysis["status"] == "unknown_view"  # no views stored yet
    assert route.called


@respx.mock
def test_replay_on_second_client(client):
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    with client.websocket_connect("/ws") as first:
        first.send_json({"type": "subscribe", "cameras": ["47"]})
        receive_until(first, "analysis")
        with client.websocket_connect("/ws") as second:
            second.send_json({"type": "subscribe", "cameras": ["47"]})
            second.receive_json()  # subscribed
            assert second.receive_json()["type"] == "frame"
            assert second.receive_json()["type"] == "analysis"


@respx.mock
def test_unsubscribe_and_disconnect_stop_polling(client):
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    respx.get("https://cams.test/cam.php?id=04").respond(304)
    manager = client.app.state.services.manager
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "cameras": ["47", "04"]})
        ws.receive_json()
        assert set(manager.monitors) == {monitor_key("47", None), monitor_key("04", None)}
        ws.send_json({"type": "subscribe", "cameras": ["04"]})
        receive_until(ws, "subscribed")
        assert set(manager.monitors) == {monitor_key("04", None)}
    deadline = time.monotonic() + 2
    while manager.monitors and time.monotonic() < deadline:
        time.sleep(0.01)
    assert manager.monitors == {}


@respx.mock
def test_key_change_replaces_monitor_without_echoing_key(client):
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    manager = client.app.state.services.manager
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "cameras": ["47"], "replicateApiKey": "key-a"})
        assert ws.receive_json() == {"type": "subscribed", "cameras": ["47"]}
        receive_until(ws, "analysis")
        assert set(manager.monitors) == {monitor_key("47", "key-a")}
        ws.send_json({"type": "subscribe", "cameras": ["47"], "replicateApiKey": "key-b"})
        assert ws.receive_json() == {"type": "subscribed", "cameras": ["47"]}
        assert set(manager.monitors) == {monitor_key("47", "key-b")}
        assert manager.replay("47", "key-a") == []


@respx.mock
def test_two_users_receive_results_from_their_own_keys(monkeypatch, settings):
    settings.detector = "replicate"
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )

    def detector_for(_settings, token, _semaphore):
        class KeyDetector:
            async def detect(self, _jpeg):
                confidence = 0.4 if token == "key-a" else 0.9
                return [Detection("car", confidence, (0.1, 0.1, 0.2, 0.2))]

        return KeyDetector()

    monkeypatch.setattr(app_main, "build_detector", detector_for)
    with (
        TestClient(app_main.create_app(settings)) as client,
        client.websocket_connect("/ws") as a,
        client.websocket_connect("/ws") as b,
    ):
        a.send_json({"type": "subscribe", "cameras": ["47"], "replicateApiKey": "key-a"})
        b.send_json({"type": "subscribe", "cameras": ["47"], "replicateApiKey": "key-b"})
        first = receive_until(a, "analysis")
        second = receive_until(b, "analysis")
        assert first["vehicles"][0]["conf"] == 0.4
        assert second["vehicles"][0]["conf"] == 0.9
        assert "key-a" not in str(first)
        assert "key-b" not in str(second)


def test_invalid_messages(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "hello"})
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "subscribe", "cameras": "47"})
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "subscribe", "cameras": ["47"], "replicateApiKey": ["not-a-key"]})
        assert ws.receive_json() == {"type": "error", "message": "invalid Replicate API key"}


def test_cors_allows_configured_origin(client):
    resp = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    resp = client.options(
        "/api/health",
        headers={"Origin": "http://evil.test", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in resp.headers


@respx.mock
def test_reanalyze_requeues_latest_frame_of_watched_camera(client):
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "cameras": ["47"]})
        first = receive_until(ws, "analysis")
        resp = client.post("/api/cameras/47/reanalyze", params={"fresh": "true"})
        assert resp.status_code == 202 and resp.json()["queued"] is True
        second = receive_until(ws, "analysis")
        assert second["frameId"] == first["frameId"]
        assert second["analysedAt"] > first["analysedAt"]


@respx.mock
def test_reanalyze_unwatched_camera_fetches_and_analyses_now(client):
    route = respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    resp = client.post("/api/cameras/47/reanalyze")
    assert resp.status_code == 200
    body = resp.json()
    assert body["queued"] is False and body["analysis"]["type"] == "analysis"
    assert route.call_count == 1
    # a second request reuses the stored image instead of fetching again
    assert client.post("/api/cameras/47/reanalyze").status_code == 200
    assert route.call_count == 1
    # Unwatched requests do not keep per-user state on the server.
    assert client.app.state.services.manager.replay("47") == []


@respx.mock
def test_reanalyze_unreachable_camera_is_502(client):
    respx.get("https://cams.test/cam.php?id=99").respond(200, content=b"")
    resp = client.post("/api/cameras/99/reanalyze")
    assert resp.status_code == 502
    assert "could not be reached" in resp.json()["detail"]
