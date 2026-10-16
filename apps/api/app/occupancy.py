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
    # (s fraction, space length as a fraction of S): spacing between neighbouring parked cars
    lengths: list[tuple[float, float]]
    # used when no spacing is known: median extent of the cars seen in this frame (px)
    default_length: float | None = None

    def car_length(self, s: float) -> float:
        """Perspective-aware length of curb one parked car takes (px) at arc position s.

        Learned from the spacing between neighbouring parked cars, so it is a car length
        for parallel parking and roughly a car width for angled ("en batería") parking.
        """
        band_based = CAR_LENGTH_PER_BAND * 2 * self.line.band(s)
        if self.lengths and self.line.length > 0:
            xs = np.array([p for p, _ in self.lengths])
            ys = np.array([v for _, v in self.lengths]) * self.line.length
            if len(self.lengths) >= MIN_SAMPLES_FOR_FIT and xs.max() - xs.min() > 0.1:
                slope, intercept = np.polyfit(xs, ys, 1)
                fitted = intercept + slope * (s / self.line.length)
            else:
                fitted = float(np.median(ys))
            return float(np.clip(fitted, 0.15 * band_based, 3 * band_based))
        return self.default_length or band_based

    def cars_between(self, a: float, b: float, steps: int = 24) -> float:
        """∫ ds / L(s): how many car lengths fit between arc positions a and b."""
        if b <= a:
            return 0.0
        xs = np.linspace(a, b, steps + 1)
        inv = np.array([1.0 / max(self.car_length(x), 1e-6) for x in xs])
        return float(np.trapezoid(inv, xs))


def near_far_bands(zone: Zone) -> tuple[float, float]:
    """Band widths at the first / last point. `band_near` belongs to the end closer to the
    camera (lower in the image), whichever direction the zone was drawn in."""
    first_y, last_y = zone.points[0][1], zone.points[-1][1]
    if first_y >= last_y:
        return zone.band_near, zone.band_far
    return zone.band_far, zone.band_near


def map_zone(zone: Zone, homography: np.ndarray, geom: FrameGeometry, lengths) -> ZoneShape:
    pts = apply_homography(homography, np.array(zone.points))
    first, last = near_far_bands(zone)
    line = Polyline(geom.to_px(pts), band_near=first * geom.width, band_far=last * geom.width)
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


FOOTPRINT_HEIGHT = 0.4  # bottom share of a box treated as the vehicle's ground footprint
# A vehicle is parked in a zone when its footprint is within this many footprint widths of
# the band. Parked cars touch or sit right next to the curb line; a car in the adjacent lane
# is about one car width further out.
MAX_GAP_WIDTHS = 0.25


def footprint_points(box_px: np.ndarray) -> list[np.ndarray]:
    """Points spanning the bottom part of a box: where the vehicle meets the road."""
    x1, y1, x2, y2 = box_px
    top = y2 - FOOTPRINT_HEIGHT * (y2 - y1)
    xm = (x1 + x2) / 2
    return [np.array(p) for p in ((x1, y2), (xm, y2), (x2, y2), (x1, top), (xm, top), (x2, top))]


def footprint_gap(line: Polyline, box_px: np.ndarray) -> tuple[float, float] | None:
    """How far a vehicle's footprint is from the zone band, in footprint widths.

    Returns (gap, centre offset in band units): gap is 0 when the footprint overlaps the
    band. None when the vehicle lies beyond the ends of the zone.
    """
    projections = [line.project(p) for p in footprint_points(box_px)]
    ss = [p.s for p in projections]
    if max(ss) - min(ss) <= 1e-6 and (min(ss) <= 0 or max(ss) >= line.length):
        return None  # entirely beyond one end of the line
    centre = line.project(ground_point(box_px))
    band = line.band(centre.s)
    if band <= 0:
        return None
    lo = min(p.signed for p in projections)
    hi = max(p.signed for p in projections)
    width = max(hi - lo, 1.0)
    gap = max(0.0, lo - band, -band - hi)
    return gap / width, abs(centre.signed) / band


def assign(shapes: list[ZoneShape], boxes_px: list[np.ndarray]) -> list[Assignment]:
    """Assign each vehicle to the zone whose band its footprint touches or sits next to."""
    out: list[Assignment] = []
    for box in boxes_px:
        best: tuple[float, float, int] | None = None
        for i, shape in enumerate(shapes):
            fit = footprint_gap(shape.line, box)
            if fit is None or fit[0] > MAX_GAP_WIDTHS:
                continue
            if best is None or fit < best[:2]:  # nearest band first, then nearest line
                best = (*fit, i)
        if best is None:
            out.append(Assignment(None))
        else:
            out.append(Assignment(best[2], occupied_interval(shapes[best[2]].line, box)))
    return out


ADJACENT_MAX = 1.2  # neighbours closer than this × their extent are packed side by side
ADJACENT_MIN = 0.15  # closer than this is the same car detected twice


def spacing_samples(
    parked: list[tuple[float, tuple[float, float]]], total: float
) -> list[tuple[float, float]]:
    """(position, space length) samples from neighbouring parked cars, as fractions of S.

    The spacing between the centres of two cars parked next to each other is the curb one
    car takes: its length when parallel parked, about its width when parked at an angle.
    Pairs with a gap between them (or a missed car) are skipped.
    """
    if total <= 0:
        return []
    out = []
    for (c0, (a0, b0)), (c1, (a1, b1)) in zip(parked, parked[1:], strict=False):
        extent = min(b0 - a0, b1 - a1)
        pitch = c1 - c0
        if extent > 0 and ADJACENT_MIN * extent < pitch <= ADJACENT_MAX * extent:
            out.append(((c0 + c1) / 2 / total, pitch / total))
    return out


def tighten(shape: ZoneShape, centre: float, interval: tuple[float, float]) -> tuple[float, float]:
    """Limit a car's occupied stretch to about one space around its centre.

    A box projected onto the curb line overstates the curb an angled car takes (its body
    sticks out along the line), which would hide free bays next to it.
    """
    half = shape.car_length(centre) / 2
    a, b = max(interval[0], centre - half), min(interval[1], centre + half)
    return (a, b) if b > a else interval


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
        parked = sorted(
            (line.project(ground_point(boxes[i])).s, a.interval)
            for i, a in enumerate(assignments)
            if a.zone_index == zi and a.interval
        )
        samples = spacing_samples(parked, total)
        shape.lengths = shape.lengths + samples
        if parked and not shape.lengths:
            shape.default_length = float(np.median([b - a for _, (a, b) in parked]))
        intervals = [tighten(shape, centre, interval) for centre, interval in parked]
        occupied = [{"polygon": geom.to_norm(line.band_polygon(a, b))} for a, b in intervals]
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
