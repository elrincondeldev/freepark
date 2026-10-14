import time

import respx

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
        assert set(manager.monitors) == {"47", "04"}
        ws.send_json({"type": "subscribe", "cameras": ["04"]})
        receive_until(ws, "subscribed")
        assert set(manager.monitors) == {"04"}
    deadline = time.monotonic() + 2
    while manager.monitors and time.monotonic() < deadline:
        time.sleep(0.01)
    assert manager.monitors == {}


def test_invalid_messages(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "hello"})
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "subscribe", "cameras": "47"})
        assert ws.receive_json()["type"] == "error"


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
def test_reanalyze_requeues_latest_frame(client):
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    assert client.post("/api/cameras/47/reanalyze").status_code == 409  # not watched
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "cameras": ["47"]})
        first = receive_until(ws, "analysis")
        resp = client.post("/api/cameras/47/reanalyze", params={"fresh": "true"})
        assert resp.status_code == 202 and resp.json()["fresh"] is True
        second = receive_until(ws, "analysis")
        assert second["frameId"] == first["frameId"]
        assert second["analysedAt"] > first["analysedAt"]
