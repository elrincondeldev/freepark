"""Vehicle-to-zone assignment, free-gap computation and temporal smoothing (D7, D8)."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import numpy as np

from app.db import Zone
from app.detection import Detection
from app.geometry import Polyline, complement, merge_intervals
from app.views import apply_homography

CAR_LENGTH_PER_BAND = 2.2  # car length ≈ 2.2 × car width, band ≈ half car width
MIN_SAMPLES_FOR_FIT = 3
BINS = 200


@dataclass
class FrameGeometry:
    width: int
    height: int

    def to_px(self, pts: np.ndarray) -> np.ndarray:
        return np.asarray(pts, np.float64) * [self.width, self.height]

    def to_norm(self, pts: np.ndarray) -> list[list[float]]:
        out = np.asarray(pts, np.float64) / [self.width, self.height]
        return [[round(float(x), 4), round(float(y), 4)] for x, y in np.clip(out, 0, 1)]


@dataclass
class ZoneShape:
    """A zone mapped into the current frame (pixel coordinates)."""

    zone: Zone
    line: Polyline
    lengths: list[tuple[float, float]]  # learned (s fraction, car length fraction of S)

    def car_length(self, s: float) -> float:
        """Perspective-aware car length in px at arc position s."""
        fallback = CAR_LENGTH_PER_BAND * 2 * self.line.band(s)
        if len(self.lengths) >= MIN_SAMPLES_FOR_FIT and self.line.length > 0:
            xs = np.array([p for p, _ in self.lengths])
            ys = np.array([v for _, v in self.lengths]) * self.line.length
            if xs.max() - xs.min() > 0.1:
                slope, intercept = np.polyfit(xs, ys, 1)
            else:
                slope, intercept = 0.0, float(ys.mean())
            fitted = intercept + slope * (s / self.line.length)
            return float(np.clip(fitted, 0.5 * fallback, 3 * fallback))
        return fallback

    def cars_between(self, a: float, b: float, steps: int = 24) -> float:
        """∫ ds / L(s): how many car lengths fit between arc positions a and b."""
        if b <= a:
            return 0.0
        xs = np.linspace(a, b, steps + 1)
        inv = np.array([1.0 / max(self.car_length(x), 1e-6) for x in xs])
        return float(np.trapezoid(inv, xs))


def map_zone(zone: Zone, homography: np.ndarray, geom: FrameGeometry, lengths) -> ZoneShape:
    pts = apply_homography(homography, np.array(zone.points))
    line = Polyline(
        geom.to_px(pts), band_near=zone.band_near * geom.width, band_far=zone.band_far * geom.width
    )
    return ZoneShape(zone, line, list(lengths))


def ground_point(box_px: np.ndarray) -> np.ndarray:
    x1, y1, x2, y2 = box_px
    return np.array([(x1 + x2) / 2, y2 - 0.05 * (y2 - y1)])


def occupied_interval(line: Polyline, box_px: np.ndarray) -> tuple[float, float]:
    """Extent of a vehicle along the line: projection of its lower body corners."""
    x1, y1, x2, y2 = box_px
    y_mid = y1 + 0.4 * (y2 - y1)
    corners = [(x1, y2), (x2, y2), (x1, y_mid), (x2, y_mid)]
    ss = [line.project(np.array(c)).s for c in corners]
    return min(ss), max(ss)


@dataclass
class Assignment:
    zone_index: int | None
    interval: tuple[float, float] | None = None


def assign(shapes: list[ZoneShape], boxes_px: list[np.ndarray]) -> list[Assignment]:
    out: list[Assignment] = []
    for box in boxes_px:
        gp = ground_point(box)
        best: tuple[float, int, float] | None = None
        for i, shape in enumerate(shapes):
            proj = shape.line.project(gp)
            band = shape.line.band(proj.s)
            if band > 0 and proj.distance <= band:
                score = proj.distance / band
                if best is None or score < best[0]:
                    best = (score, i, proj.s)
        if best is None:
            out.append(Assignment(None))
        else:
            out.append(Assignment(best[1], occupied_interval(shapes[best[1]].line, box)))
    return out


def free_runs(free: np.ndarray) -> list[tuple[int, int]]:
    """Maximal runs [start, end) of True bins."""
    runs, start = [], None
    for i, f in enumerate(free):
        if f and start is None:
            start = i
        elif not f and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(free)))
    return runs


@dataclass
class ZoneHistory:
    signature: tuple
    last_seen: float = 0.0
    streak: np.ndarray = field(default_factory=lambda: np.zeros(BINS, np.int32))


class Smoother:
    """Hysteresis: a bin is available only after N consecutive free frames *of its view*.

    Vigo cameras rotate between viewpoints every frame or two, so history is kept per
    zone (zones belong to one view) and survives frames of other views; it expires when
    the view has not been seen for `max_age` seconds, since parking may have changed.
    """

    def __init__(self, confirm_frames: int, max_age: float = 300.0, clock=time.monotonic) -> None:
        self.confirm = confirm_frames
        self.max_age = max_age
        self._clock = clock
        self._zones: dict[int, ZoneHistory] = {}

    def confirmed_free(self, zone: Zone, raw_free: np.ndarray) -> np.ndarray:
        now = self._clock()
        signature = (zone.updated_at, tuple(zone.points), zone.band_near, zone.band_far)
        hist = self._zones.get(zone.id)
        if hist is None or hist.signature != signature or now - hist.last_seen > self.max_age:
            hist = self._zones[zone.id] = ZoneHistory(signature)
        hist.last_seen = now
        hist.streak = np.where(raw_free, hist.streak + 1, 0)
        return hist.streak >= self.confirm


def bins_free(length: float, occupied: list[tuple[float, float]]) -> np.ndarray:
    free = np.ones(BINS, bool)
    if length <= 0:
        return free
    for a, b in merge_intervals(occupied):
        lo = max(int(math.floor(a / length * BINS)), 0)
        hi = min(int(math.ceil(b / length * BINS)), BINS)
        free[lo:hi] = False
    return free


@dataclass
class ZoneResult:
    zone_id: int
    name: str
    occupied: list[dict]
    available: list[dict]
    length_samples: list[tuple[float, float]]

    @property
    def spaces(self) -> int:
        return sum(a["spaces"] for a in self.available)

    def message(self) -> dict:
        return {
            "zoneId": self.zone_id,
            "name": self.name,
            "occupied": self.occupied,
            "available": self.available,
            "spaces": self.spaces,
        }


def evaluate_zones(
    camera_id: str,
    view_id: int,
    zones: list[Zone],
    lengths: dict[int, list[tuple[float, float]]],
    homography: np.ndarray,
    detections: list[Detection],
    geom: FrameGeometry,
    smoother: Smoother,
    gap_margin: float,
) -> tuple[list[ZoneResult], list[int | None]]:
    """Returns per-zone results and, per detection, the id of the zone it occupies."""
    shapes = [map_zone(z, homography, geom, lengths.get(z.id, [])) for z in zones]
    boxes = [geom.to_px(np.array(d.box).reshape(2, 2)).reshape(4) for d in detections]
    assignments = assign(shapes, boxes)
    vehicle_zones: list[int | None] = [
        shapes[a.zone_index].zone.id if a.zone_index is not None else None for a in assignments
    ]

    results: list[ZoneResult] = []
    for zi, shape in enumerate(shapes):
        line, total = shape.line, shape.line.length
        intervals = [a.interval for a in assignments if a.zone_index == zi and a.interval]
        occupied = []
        samples = []
        for a, b in intervals:
            occupied.append({"polygon": geom.to_norm(line.band_polygon(a, b))})
            if total > 0 and b > a:
                samples.append(((a + b) / 2 / total, (b - a) / total))
        raw_free = bins_free(total, intervals)
        confirmed = smoother.confirmed_free(shape.zone, raw_free)
        margin = shape.zone.min_gap_cars or gap_margin
        available = []
        for start, end in free_runs(confirmed):
            a, b = start / BINS * total, end / BINS * total
            spaces = int(math.floor(shape.cars_between(a, b) / margin + 1e-9))
            if spaces >= 1:
                available.append(
                    {"polygon": geom.to_norm(line.band_polygon(a, b)), "spaces": spaces}
                )
        results.append(ZoneResult(shape.zone.id, shape.zone.name, occupied, available, samples))
    return results, vehicle_zones


__all__ = [
    "FrameGeometry",
    "Smoother",
    "ZoneResult",
    "ZoneShape",
    "assign",
    "bins_free",
    "complement",
    "evaluate_zones",
    "free_runs",
    "map_zone",
]
