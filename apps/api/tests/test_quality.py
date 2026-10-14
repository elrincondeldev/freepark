import cv2

from app.quality import assess, banner_mask, brightness
from tests.fixtures import gray, make_night

MASK = (0.0, 0.0, 1.0, 0.09)


def check(img):
    return assess(img, MASK, blur_threshold=1.0, dark_threshold=25)


def test_sharp_fixture_passes():
    q = check(gray("47_1791962972.jpg"))
    assert q.ok, q


def test_blurred_frame_rejected():
    blurred = cv2.GaussianBlur(gray("47_1791962972.jpg"), (0, 0), 3)
    q = check(blurred)
    assert not q.ok and q.reason == "too blurred"


def test_motion_blur_rejected():
    import numpy as np

    kernel = np.zeros((1, 25), np.float32)
    kernel[0, :] = 1 / 25  # horizontal pan blur
    q = check(cv2.filter2D(gray("34_1791962940.jpg"), -1, kernel))
    assert not q.ok


def test_dark_frame_rejected():
    q = check((gray("04_1791962918.jpg") * 0.1).astype("uint8"))
    assert not q.ok and q.reason == "too dark"


def test_synthetic_night_frame_still_usable():
    q = check(make_night(gray("47_1791962972.jpg")))
    assert q.ok, q


def test_banner_is_ignored():
    img = gray("47_1791962972.jpg").copy()
    img[: int(0.09 * 216)] = 255  # wipe banner area
    assert abs(brightness(img, MASK) - brightness(gray("47_1791962972.jpg"), MASK)) < 1e-6
    assert banner_mask((216, 384), MASK)[:19].max() == 0
