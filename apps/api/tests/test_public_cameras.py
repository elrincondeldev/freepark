import socket
from unittest.mock import AsyncMock

import pytest
import respx

from app.camera_ids import (
    InvalidCameraId,
    custom_camera_id,
    normalize_source_url,
    parse_camera_source,
)
from app.source import FetchError, _resolve_public_ip
from tests.fixtures import frame_bytes

SOURCE = "https://cameras.example.org/street/current.jpg?camera=main"
PINNED = "https://93.184.216.34/street/current.jpg?camera=main"


def test_public_camera_urls_have_stable_ids_and_reject_local_targets():
    camera_id, url = parse_camera_source(SOURCE + "#preview")
    assert url == SOURCE
    assert camera_id == custom_camera_id(SOURCE)
    assert len(camera_id) == 26
    for bad in (
        "http://localhost/camera.jpg",
        "http://127.0.0.1/camera.jpg",
        "http://camera.local/image.jpg",
        "http://camera.example.org:8080/image.jpg",
        "https://user:secret@camera.example.org/image.jpg",
        "file:///etc/passwd",
    ):
        with pytest.raises(InvalidCameraId):
            normalize_source_url(bad)


@pytest.mark.asyncio
async def test_dns_must_resolve_only_to_public_addresses(monkeypatch):
    def private_dns(host, port, *_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]

    monkeypatch.setattr(socket, "getaddrinfo", private_dns)
    with pytest.raises(FetchError, match="public addresses"):
        await _resolve_public_ip("camera.example.org", 443)


@respx.mock
def test_probe_and_reconnect_register_public_jpeg_per_browser(client, monkeypatch):
    image = frame_bytes("47_1791962972.jpg")
    route = respx.get(PINNED).respond(200, content=image)
    monkeypatch.setattr("app.source._resolve_public_ip", AsyncMock(return_value="93.184.216.34"))
    headers = {"X-Client-Id": "browserA"}
    response = client.get("/api/cameras/probe", headers=headers, params={"input": SOURCE})
    assert response.status_code == 200
    body = response.json()
    assert body["cameraId"] == custom_camera_id(SOURCE)
    assert body["sourceUrl"] == SOURCE
    assert client.get(body["url"]).content == image
    assert route.calls.last.request.headers["host"] == "cameras.example.org"
    assert route.calls.last.request.extensions["sni_hostname"] == "cameras.example.org"

    camera_id = body["cameraId"]
    other = {"X-Client-Id": "browserB"}
    assert client.get(f"/api/cameras/{camera_id}/probe", headers=other).status_code == 502
    assert client.post(
        "/api/cameras/sources", headers=other,
        json={"sources": {camera_id: SOURCE}},
    ).json() == {"registered": 1}
    assert client.get(f"/api/cameras/{camera_id}/probe", headers=other).status_code == 200


@respx.mock
def test_public_camera_redirect_is_not_followed(client, monkeypatch):
    route = respx.get(PINNED).respond(302, headers={"Location": "http://127.0.0.1/private"})
    monkeypatch.setattr("app.source._resolve_public_ip", AsyncMock(return_value="93.184.216.34"))
    response = client.get(
        "/api/cameras/probe", headers={"X-Client-Id": "browserA"}, params={"input": SOURCE}
    )
    assert response.status_code == 502
    assert len(route.calls) == 1


def test_registration_rejects_mismatched_id(client):
    response = client.post(
        "/api/cameras/sources", headers={"X-Client-Id": "browserA"},
        json={"sources": {"c_" + "0" * 24: SOURCE}},
    )
    assert response.status_code == 400


@respx.mock
def test_registered_public_camera_streams_live_frames(client, monkeypatch):
    image = frame_bytes("47_1791962972.jpg")
    route = respx.get(PINNED).respond(200, content=image)
    monkeypatch.setattr("app.source._resolve_public_ip", AsyncMock(return_value="93.184.216.34"))
    camera_id = custom_camera_id(SOURCE)
    response = client.post(
        "/api/cameras/sources",
        headers={"X-Client-Id": "browserA"},
        json={"sources": {camera_id: SOURCE}},
    )
    assert response.status_code == 200

    with client.websocket_connect("/ws") as ws:
        ws.send_json({
            "type": "subscribe", "cameras": [camera_id], "clientId": "browserA",
        })
        assert ws.receive_json() == {"type": "subscribed", "cameras": [camera_id]}
        messages = [ws.receive_json() for _ in range(2)]
        frame = next(message for message in messages if message["type"] == "frame")
        analysis = next(message for message in messages if message["type"] == "analysis")
        assert frame["cameraId"] == camera_id
        assert analysis["frameId"] == frame["frameId"]
        assert client.get(frame["url"]).content == image
    assert route.called
