import respx

JPEG = b"\xff\xd8\xff\xe0" + b"img" * 20
LM = "Wed, 14 Oct 2026 07:17:51 GMT"


@respx.mock
def test_probe_by_id_returns_preview(client):
    respx.get("https://cams.test/cam.php?id=04").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    resp = client.get("/api/cameras/4/probe")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cameraId"] == "04"
    img = client.get(body["url"])
    assert img.status_code == 200
    assert img.content == JPEG
    assert img.headers["content-type"] == "image/jpeg"
    assert "immutable" in img.headers["cache-control"]


@respx.mock
def test_probe_by_url_input(client):
    respx.get("https://cams.test/cam.php?id=47").respond(200, content=JPEG)
    resp = client.get(
        "/api/cameras/probe", params={"input": "https://camaras.vigo.org/webcam/cam.php?id=47"}
    )
    assert resp.status_code == 200
    assert resp.json()["cameraId"] == "47"


def test_probe_rejects_bad_input(client):
    assert (
        client.get("/api/cameras/probe", params={"input": "https://example.com"}).status_code == 400
    )
    assert client.get("/api/cameras/abc/probe").status_code == 400


@respx.mock
def test_probe_unreachable_camera(client):
    respx.get("https://cams.test/cam.php?id=99").respond(200, content=b"")
    resp = client.get("/api/cameras/99/probe")
    assert resp.status_code == 502
    assert "could not be reached" in resp.json()["detail"]


def test_missing_frame_404(client):
    assert client.get("/api/cameras/47/frames/123-deadbeef.jpg").status_code == 404
    assert client.get("/api/cameras/47/frames/nope.jpg").status_code == 404
