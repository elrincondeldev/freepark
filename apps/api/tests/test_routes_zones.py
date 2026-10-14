import pytest

from tests.test_routes_views import create_view

VALID = {
    "name": "Right curb",
    "points": [[0.62, 0.95], [0.55, 0.6], [0.5, 0.35]],
    "bandNear": 0.04,
    "bandFar": 0.012,
}


@pytest.fixture
def view(client):
    return create_view(client)


def test_create_list_update_delete_zone(client, view):
    resp = client.post(f"/api/views/{view['id']}/zones", json=VALID)
    assert resp.status_code == 201, resp.text
    zone = resp.json()
    assert zone["points"] == VALID["points"] and zone["minGapCars"] is None
    assert [z["id"] for z in client.get(f"/api/views/{view['id']}/zones").json()] == [zone["id"]]

    patched = client.patch(
        f"/api/zones/{zone['id']}",
        json={"name": "Right", "points": [[0.6, 0.9], [0.5, 0.4]], "minGapCars": 1.4},
    ).json()
    assert patched["name"] == "Right" and len(patched["points"]) == 2
    assert patched["minGapCars"] == 1.4
    cleared = client.patch(f"/api/zones/{zone['id']}", json={"minGapCars": None}).json()
    assert cleared["minGapCars"] is None and cleared["name"] == "Right"

    assert client.delete(f"/api/zones/{zone['id']}").status_code == 204
    assert client.get(f"/api/views/{view['id']}/zones").json() == []
    assert client.delete(f"/api/zones/{zone['id']}").status_code == 404


@pytest.mark.parametrize(
    "patch",
    [
        {"points": [[0.5, 0.5]]},  # too few points
        {"points": [[0.5, 0.5], [1.2, 0.3]]},  # out of range
        {"points": [[0.1, 0.1]] * 65},  # too many
        {"bandNear": 0},
        {"bandFar": -0.1},
        {"name": ""},
        {"minGapCars": 0.1},
    ],
)
def test_invalid_payloads_rejected(client, view, patch):
    resp = client.post(f"/api/views/{view['id']}/zones", json={**VALID, **patch})
    assert resp.status_code == 422


def test_zone_for_unknown_view_404(client):
    assert client.post("/api/views/999/zones", json=VALID).status_code == 404
    assert client.get("/api/views/999/zones").status_code == 404


def test_zone_count_in_view(client, view):
    client.post(f"/api/views/{view['id']}/zones", json=VALID)
    assert client.get("/api/cameras/47/views").json()[0]["zoneCount"] == 1
