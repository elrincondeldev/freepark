"""Helpers to load the captured camera fixture frames."""

import json
from functools import cache
from pathlib import Path

import cv2
import numpy as np

FRAMES = Path(__file__).parent / "fixtures" / "frames"


@cache
def manifest() -> dict[str, dict[str, list[str]]]:
    data = json.loads((FRAMES / "views.json").read_text())
    data.pop("_comment", None)
    return data


def frame_bytes(name: str) -> bytes:
    return (FRAMES / name).read_bytes()


def gray(name: str) -> np.ndarray:
    return cv2.imread(str(FRAMES / name), cv2.IMREAD_GRAYSCALE)


def to_jpeg(img: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", img)[1].tobytes()


def make_night(img: np.ndarray, seed: int = 0) -> np.ndarray:
    """Synthetic night version: strong gamma darkening plus sensor noise."""
    rng = np.random.default_rng(seed)
    dark = (255 * (img / 255.0) ** 2.6 * 0.6).astype(np.float32)
    noisy = dark + rng.normal(0, 4, img.shape)
    return np.clip(noisy, 0, 255).astype(np.uint8)
