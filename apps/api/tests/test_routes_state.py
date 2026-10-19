import respx

from app.frames import make_frame_id
from tests.fixtures import frame_bytes


def test_browser_snapshot_restores_views_zones_and_images_without_crossing_sessions(client):
    image = frame_bytes("47_1791962972.jpg")
    frame_id = make_frame_id(1_791_000_000, image)
    client.app.state.services.store.save("47", frame_id, image)
    a = {"X-Client-Id": "browserA"}
    b = {"X-Client-Id": "browserB"}
    assert client.get("/api/state/status", headers=b).json() == {"initialized": False}

    view_response = client.post(
        "/api/cameras/47/views", headers=a, json={"frameId": frame_id, "name": "Avenue"}
    )
    assert view_response.status_code == 201
    view = view_response.json()
    zone_response = client.post(
        f"/api/views/{view['id']}/zones", headers=a,
        json={
            "name": "Curb", "points": [[0.2, 0.9], [0.5, 0.5]],
            "bandNear": 0.03, "bandFar": 0.02,
        },
    )
    assert zone_response.status_code == 201
    assert client.get("/api/cameras/47/views", headers=b).json() == []

    snapshot = client.get("/api/state", headers=a).json()
    assert len(snapshot["exemplars"]) == 1
    assert snapshot["exemplars"][0]["image"]
    assert client.post("/api/state", headers=b, json=snapshot).status_code == 200
    assert client.get("/api/state/status", headers=b).json() == {"initialized": True}
    restored = client.get("/api/cameras/47/views", headers=b).json()[0]
    assert restored["zoneCount"] == 1
    assert client.get(restored["referenceUrl"]).content == image

    client.delete(f"/api/views/{view['id']}", headers=a)
    assert client.get("/api/cameras/47/views", headers=b).json()[0]["name"] == "Avenue"


def test_snapshot_rejects_missing_image_and_invalid_client_id(client):
    invalid = {"views": [], "zones": [], "samples": {}, "exemplars": [{"image": ""}]}
    response = client.post("/api/state", headers={"X-Client-Id": "browserA"}, json=invalid)
    assert response.status_code == 400
    assert client.get("/api/state", headers={"X-Client-Id": "../oops"}).status_code == 400
    assert client.get("/api/views/1/reference.jpg?clientId=../oops").status_code == 400


@respx.mock
def test_live_analysis_uses_the_subscribing_browsers_views(client):
    image = frame_bytes("47_1791962972.jpg")
    frame_id = make_frame_id(1_791_000_000, image)
    client.app.state.services.store.save("47", frame_id, image)
    a = {"X-Client-Id": "browserA"}
    assert client.post(
        "/api/cameras/47/views", headers=a, json={"frameId": frame_id, "name": "Avenue"}
    ).status_code == 201
    respx.get("https://cams.test/cam.php?id=47").respond(200, content=image)

    def analysis(ws, client_id):
        ws.send_json({"type": "subscribe", "cameras": ["47"], "clientId": client_id})
        for _ in range(5):
            message = ws.receive_json()
            if message["type"] == "analysis":
                return message
        raise AssertionError("analysis not received")

    with client.websocket_connect("/ws") as browser_a:
        assert analysis(browser_a, "browserA")["status"] == "ok"
    with client.websocket_connect("/ws") as browser_b:
        assert analysis(browser_b, "browserB")["status"] == "unknown_view"
