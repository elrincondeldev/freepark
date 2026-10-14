import cv2
import numpy as np
import pytest

from app.frames import make_frame_id
from tests.fixtures import frame_bytes, gray, make_night, to_jpeg


def put_frame(client, camera_id, name_or_bytes):
    data = frame_bytes(name_or_bytes) if isinstance(name_or_bytes, str) else name_or_bytes
    fid = make_frame_id(1_791_000_000, data)
    client.app.state.services.store.save(camera_id, fid, data)
    return fid


def create_view(client, cam="47", name="47_1791962972.jpg", view_name="Avenue"):
    fid = put_frame(client, cam, name)
    resp = client.post(f"/api/cameras/{cam}/views", json={"frameId": fid, "name": view_name})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_list_rename_view(client):
    view = create_view(client)
    assert view["cameraId"] == "47" and view["name"] == "Avenue" and view["zoneCount"] == 0
    ref = client.get(view["referenceUrl"])
    assert ref.status_code == 200 and ref.content[:2] == b"\xff\xd8"
    listed = client.get("/api/cameras/47/views").json()
    assert [v["id"] for v in listed] == [view["id"]]
    renamed = client.patch(f"/api/views/{view['id']}", json={"name": "North"}).json()
    assert renamed["name"] == "North"


def test_create_view_with_pruned_frame_404(client):
    resp = client.post("/api/cameras/47/views", json={"frameId": "1-deadbeef", "name": "x"})
    assert resp.status_code == 404


def test_delete_view_deletes_zones_and_unmatches(client):
    view = create_view(client)
    svc = client.app.state.services
    zone = svc.repo.create_zone(view["id"], "Z", [(0.1, 0.9), (0.4, 0.5)], 0.03, 0.01)
    match, _ = svc.views.match("47", gray("47_1791963042.jpg"))
    assert match is not None and match.view_id == view["id"]
    assert client.delete(f"/api/views/{view['id']}").status_code == 204
    assert svc.repo.get_zone(zone.id) is None
    assert client.get("/api/cameras/47/views").json() == []
    match, _ = svc.views.match("47", gray("47_1791963042.jpg"))
    assert match is None  # frames of the deleted view are now unknown


def test_each_frame_matches_its_own_view(client):
    a = create_view(client, name="47_1791962972.jpg", view_name="A")
    b = create_view(client, name="47_1791963327.jpg", view_name="B")
    svc = client.app.state.services
    assert svc.views.match("47", gray("47_1791963184.jpg"))[0].view_id == a["id"]
    assert svc.views.match("47", gray("47_1791963469.jpg"))[0].view_id == b["id"]


def test_recapture_reference_realigns_zones(client):
    view = create_view(client)
    svc = client.app.state.services
    zone = svc.repo.create_zone(view["id"], "Z", [(0.5, 0.6), (0.6, 0.8)], 0.03, 0.01)
    shifted = cv2.warpAffine(
        cv2.imread("tests/fixtures/frames/47_1791962972.jpg"),
        np.float32([[1, 0, -12], [0, 1, 6]]),
        (384, 216),
        borderMode=cv2.BORDER_REPLICATE,
    )
    fid = put_frame(client, "47", to_jpeg(shifted))
    resp = client.post(f"/api/views/{view['id']}/reference", json={"frameId": fid})
    assert resp.status_code == 200 and resp.json()["zonesRealigned"] is True
    moved = svc.repo.get_zone(zone.id).points[0]
    assert moved[0] == pytest.approx(0.5 - 12 / 384, abs=0.005)
    assert moved[1] == pytest.approx(0.6 + 6 / 216, abs=0.007)


def test_night_exemplar_is_learned_and_used(client):
    view = create_view(client)
    svc = client.app.state.services
    day = gray("47_1791963042.jpg")
    night = make_night(gray("47_1791963113.jpg"))
    match, _ = svc.views.match("47", day)
    # a frame with similar lighting is not stored again
    assert not svc.views.maybe_learn_exemplar("47", match, to_jpeg(day), day)
    night_match, _ = svc.views.match("47", night)
    if night_match is not None:  # matched through CLAHE already: learn it as a night exemplar
        assert svc.views.maybe_learn_exemplar("47", night_match, to_jpeg(night), night)
    else:  # learn from a confident night frame that differs only by noise
        seed_match, _ = svc.views.match("47", make_night(day, seed=1))
        assert seed_match is not None
        assert svc.views.maybe_learn_exemplar("47", seed_match, to_jpeg(make_night(day)), night)
    assert len(svc.repo.list_exemplars(view["id"])) == 2
    later_night = make_night(gray("47_1791963256.jpg"), seed=3)
    m, _ = svc.views.match("47", later_night)
    assert m is not None and m.view_id == view["id"]
