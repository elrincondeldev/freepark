import pytest

from app.camera_ids import InvalidCameraId, normalize_camera_id, parse_camera_input


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("4", "04"),
        ("04", "04"),
        ("47", "47"),
        (" 34 ", "34"),
        ("123", "123"),
        ("https://camaras.vigo.org/webcam/cam.php?id=47", "47"),
        ("https://camaras.vigo.org/webcam/cam.php?id=4", "04"),
        ("camaras.vigo.org/webcam/cam.php?id=04", "04"),
        ("http://camaras.vigo.org/webcam/cam.php?lang=gal&id=34", "34"),
    ],
)
def test_accepted_inputs(raw, expected):
    assert parse_camera_input(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "abc",
        "1234",
        "-1",
        "https://example.com/foo",
        "https://example.com/webcam/cam.php?id=47",
        "https://camaras.vigo.org/webcam/cam.php",
        "https://camaras.vigo.org/webcam/cam.php?id=abc",
        "https://camaras.vigo.org/other.php?id=47",
    ],
)
def test_rejected_inputs(raw):
    with pytest.raises(InvalidCameraId):
        parse_camera_input(raw)


def test_normalize_rejects_url():
    with pytest.raises(InvalidCameraId):
        normalize_camera_id("https://camaras.vigo.org/webcam/cam.php?id=47")
