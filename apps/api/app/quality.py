"""Frame quality check: reject blurred (mid-rotation) or too-dark frames."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

Mask = tuple[float, float, float, float]


def banner_mask(shape: tuple[int, int], mask: Mask) -> np.ndarray:
    """uint8 mask (255 = usable) excluding the burned-in banner rectangle."""
    h, w = shape
    out = np.full((h, w), 255, np.uint8)
    x, y, mw, mh = mask
    out[int(y * h) : int((y + mh) * h), int(x * w) : int((x + mw) * w)] = 0
    return out


def brightness(gray: np.ndarray, mask: Mask) -> float:
    return float(gray[banner_mask(gray.shape, mask) > 0].mean())


def directional_sharpness(gray: np.ndarray, usable: np.ndarray) -> float:
    """Gradient energy in the *weakest* direction, normalised by image contrast.

    Pan/tilt motion blurs along one axis only, which a Laplacian barely notices;
    taking the minimum of horizontal and vertical gradient energy catches it, and
    dividing by intensity variance keeps dark (night) frames comparable.
    Sharp camera frames score ~2.5-7, blurred ones < 1.
    """
    img = gray.astype(np.float64)
    gx = cv2.Sobel(img, cv2.CV_64F, 1, 0, ksize=3)[usable]
    gy = cv2.Sobel(img, cv2.CV_64F, 0, 1, ksize=3)[usable]
    contrast = max(float(img[usable].var()), 1.0)
    return min(float((gx**2).mean()), float((gy**2).mean())) / contrast


@dataclass(frozen=True)
class Quality:
    ok: bool
    sharpness: float
    brightness: float
    reason: str | None = None


def assess(gray: np.ndarray, mask: Mask, blur_threshold: float, dark_threshold: float) -> Quality:
    usable = banner_mask(gray.shape, mask) > 0
    # erode so the banner edge itself does not count as sharp detail
    usable = cv2.erode(usable.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    sharpness = directional_sharpness(gray, usable)
    light = float(gray[usable].mean())
    if light < dark_threshold:
        return Quality(False, sharpness, light, "too dark")
    if sharpness < blur_threshold:
        return Quality(False, sharpness, light, "too blurred")
    return Quality(True, sharpness, light)
