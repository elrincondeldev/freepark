"""Vehicle detection behind a small adapter so the Replicate model is swappable."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import cv2
import numpy as np

VEHICLE_CLASSES = ("car", "van", "truck", "bus", "motorcycle")


@dataclass(frozen=True)
class Detection:
    cls: str
    conf: float
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 normalised to [0, 1]


class DetectionDisabled(Exception):
    """Detection is not configured (e.g. missing API token)."""


class DetectionUnavailable(Exception):
    """The model failed, timed out or is rate limited for this frame."""


class Detector(Protocol):
    async def detect(self, jpeg: bytes) -> list[Detection]: ...


# --- helpers -----------------------------------------------------------------


def decode(jpeg: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise DetectionUnavailable("frame could not be decoded")
    return img


def upscale_jpeg(jpeg: bytes, factor: float) -> tuple[bytes, int, int]:
    """Upscale (Lanczos) so small distant vehicles are easier to detect."""
    img = decode(jpeg)
    if factor and factor != 1:
        img = cv2.resize(img, None, fx=factor, fy=factor, interpolation=cv2.INTER_LANCZOS4)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise DetectionUnavailable("frame could not be encoded")
    h, w = img.shape[:2]
    return buf.tobytes(), w, h


def build_input(template: str, image_uri: str) -> dict[str, Any]:
    def substitute(value: Any) -> Any:
        if value == "{image}":
            return image_uri
        if isinstance(value, dict):
            return {k: substitute(v) for k, v in value.items()}
        if isinstance(value, list):
            return [substitute(v) for v in value]
        return value

    return substitute(json.loads(template))


def normalise_class(label: str) -> str | None:
    """Map model labels ('car van', 'Truck') to a vehicle class, or None."""
    for token in label.lower().replace(",", " ").split():
        if token in VEHICLE_CLASSES:
            return token
    return None


def _clip_box(x1: float, y1: float, x2: float, y2: float, w: int, h: int):
    box = (
        min(max(x1 / w, 0.0), 1.0),
        min(max(y1 / h, 0.0), 1.0),
        min(max(x2 / w, 0.0), 1.0),
        min(max(y2 / h, 0.0), 1.0),
    )
    return box if box[2] > box[0] and box[3] > box[1] else None


def parse_grounding_dino(output: Any, w: int, h: int) -> list[Detection]:
    out: list[Detection] = []
    for det in (output or {}).get("detections", []):
        cls = normalise_class(str(det.get("label", "")))
        box = _clip_box(*det["bbox"], w, h) if len(det.get("bbox", [])) == 4 else None
        if cls and box:
            out.append(Detection(cls, float(det.get("confidence", 0.0)), box))
    return out


def parse_yolo(output: Any, w: int, h: int) -> list[Detection]:
    raw = output.get("json_str") if isinstance(output, dict) else output
    data = json.loads(raw) if isinstance(raw, str) else raw
    items = data.values() if isinstance(data, dict) else (data or [])
    out: list[Detection] = []
    for det in items:
        cls = normalise_class(str(det.get("cls", det.get("label", ""))))
        box = _clip_box(det["x0"], det["y0"], det["x1"], det["y1"], w, h)
        if cls and box:
            out.append(Detection(cls, float(det.get("score", 0.0)), box))
    return out


def _area(b: tuple[float, float, float, float]) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = _area(a) + _area(b) - inter
    return inter / union if union > 0 else 0.0


def _contains_centre(outer, inner) -> bool:
    cx, cy = (inner[0] + inner[2]) / 2, (inner[1] + inner[3]) / 2
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def suppress_duplicates(detections: list[Detection], iou_threshold: float = 0.5) -> list[Detection]:
    """Clean open-vocabulary detector output.

    1. Non-maximum suppression across classes: of two boxes overlapping more than
       `iou_threshold`, keep the more confident one (one car, one box).
    2. Drop "group" boxes that enclose the centres of two or more other detections and are
       much larger than them: they cover a row of cars and would hide the gaps between them.
    """
    kept: list[Detection] = []
    for det in sorted(detections, key=lambda d: d.conf, reverse=True):
        if all(_iou(det.box, k.box) <= iou_threshold for k in kept):
            kept.append(det)
    result = []
    for det in kept:
        inner = [
            k
            for k in kept
            if k is not det
            and _contains_centre(det.box, k.box)
            and _area(det.box) > 1.8 * _area(k.box)
        ]
        if len(inner) < 2:
            result.append(det)
    return result


PARSERS: dict[str, Callable[[Any, int, int], list[Detection]]] = {
    "grounding_dino": parse_grounding_dino,
    "yolo": parse_yolo,
}


# --- Replicate -----------------------------------------------------------------

Runner = Callable[[str, dict[str, Any]], Awaitable[Any]]


def replicate_runner(token: str) -> Runner:
    import replicate

    client = replicate.Client(api_token=token)

    async def run(model: str, payload: dict[str, Any]) -> Any:
        return await client.async_run(model, input=payload)

    return run


def _retry_after(exc: Exception) -> float | None:
    status = getattr(exc, "status", None)
    if status != 429:
        return None
    detail = str(getattr(exc, "detail", "") or exc)
    import re

    m = re.search(r"resets in ~?(\d+(?:\.\d+)?)s", detail)
    return float(m.group(1)) if m else 10.0


class ReplicateDetector:
    def __init__(
        self,
        runner: Runner,
        model: str,
        input_template: str,
        output_format: str,
        *,
        upscale: float = 2.0,
        min_confidence: float = 0.3,
        max_box_area: float = 1.0,
        timeout: float = 90.0,
        max_concurrent: int = 4,
        semaphore: asyncio.Semaphore | None = None,
        max_rate_limit_wait: float = 20.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if output_format not in PARSERS:
            raise ValueError(f"unknown output format {output_format!r}")
        self._runner = runner
        self._model = model
        self._template = input_template
        self._parse = PARSERS[output_format]
        self._upscale = upscale
        self._min_conf = min_confidence
        self._max_area = max_box_area
        self._timeout = timeout
        self._semaphore = semaphore or asyncio.Semaphore(max_concurrent)
        self._clock = clock
        self._sleep = sleep
        self._max_wait = max_rate_limit_wait
        self._blocked_until = 0.0
        self.predictions = 0

    async def detect(self, jpeg: bytes) -> list[Detection]:
        if self._blocked_until - self._clock() > self._max_wait:
            raise DetectionUnavailable("rate limited")
        data, w, h = await asyncio.to_thread(upscale_jpeg, jpeg, self._upscale)
        uri = "data:image/jpeg;base64," + base64.b64encode(data).decode()
        payload = build_input(self._template, uri)
        async with self._semaphore:
            output = await self._predict(payload)
        try:
            detections = self._parse(output, w, h)
        except (KeyError, TypeError, ValueError) as exc:
            raise DetectionUnavailable(f"unexpected model output: {exc}") from exc
        return suppress_duplicates(
            [d for d in detections if d.conf >= self._min_conf and _area(d.box) <= self._max_area]
        )

    async def _predict(self, payload: dict[str, Any]) -> Any:
        """One prediction; short rate-limit windows are waited out (up to 3 attempts)."""
        attempts = 3
        for attempt in range(attempts):
            wait = self._blocked_until - self._clock()
            if wait > 0:
                if wait > self._max_wait:
                    raise DetectionUnavailable(f"rate limited for {wait:.0f}s")
                await self._sleep(wait)
            self.predictions += 1
            try:
                return await asyncio.wait_for(self._runner(self._model, payload), self._timeout)
            except TimeoutError as exc:
                raise DetectionUnavailable("prediction timed out") from exc
            except Exception as exc:
                retry = _retry_after(exc)
                if retry is None:
                    if getattr(exc, "status", None) in (401, 403):
                        raise DetectionUnavailable("Replicate rejected this API key") from exc
                    raise DetectionUnavailable("prediction failed") from exc
                self._blocked_until = self._clock() + retry
                if attempt == attempts - 1 or retry > self._max_wait:
                    raise DetectionUnavailable(f"rate limited for {retry:.0f}s") from exc
        raise DetectionUnavailable("rate limited")


class DisabledDetector:
    async def detect(self, jpeg: bytes) -> list[Detection]:
        raise DetectionDisabled("Add your Replicate API key to enable analysis")


# --- Fake ----------------------------------------------------------------------


class FakeDetector:
    """Deterministic detections for development and tests.

    With a fixture file (JSON: {"<sha256 prefix>|*": [{"cls", "conf", "box"}]}) the
    boxes for a frame come from its hash prefix or the `*` default. Without one,
    a stable pseudo-random subset of `slots` is returned per frame so availability
    changes over time.
    """

    DEFAULT_SLOTS = [
        (0.30, 0.55, 0.38, 0.68),
        (0.24, 0.66, 0.33, 0.80),
        (0.17, 0.78, 0.29, 0.95),
        (0.60, 0.50, 0.68, 0.62),
        (0.66, 0.60, 0.76, 0.75),
        (0.74, 0.72, 0.88, 0.92),
    ]

    def __init__(self, fixture: Path | None = None, slots=None) -> None:
        self._table: dict[str, list[Detection]] = {}
        if fixture is not None:
            raw = json.loads(Path(fixture).read_text())
            self._table = {
                key: [Detection(d["cls"], d["conf"], tuple(d["box"])) for d in dets]
                for key, dets in raw.items()
            }
        self._slots = slots or self.DEFAULT_SLOTS
        self.calls = 0

    async def detect(self, jpeg: bytes) -> list[Detection]:
        self.calls += 1
        digest = hashlib.sha256(jpeg).hexdigest()
        if self._table:
            for key, dets in self._table.items():
                if key != "*" and digest.startswith(key):
                    return list(dets)
            return list(self._table.get("*", []))
        rng = random.Random(digest)
        return [Detection("car", 0.9, slot) for slot in self._slots if rng.random() < 0.7]


def build_detector(
    settings, token: str | None = None, semaphore: asyncio.Semaphore | None = None
) -> Detector:
    if settings.detector == "fake":
        return FakeDetector(settings.fake_detections_file)
    if not token:
        return DisabledDetector()
    return ReplicateDetector(
        replicate_runner(token),
        settings.replicate_model,
        settings.replicate_input_template,
        settings.replicate_output_format,
        upscale=settings.detection_upscale,
        min_confidence=settings.detection_min_confidence,
        max_box_area=settings.detection_max_box_area,
        timeout=settings.replicate_timeout_seconds,
        max_concurrent=settings.max_concurrent_predictions,
        semaphore=semaphore,
    )
