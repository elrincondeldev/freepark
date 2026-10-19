"""Session-only view and zone state. The browser owns durable storage."""

from __future__ import annotations

import threading
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

MAX_LENGTH_SAMPLES = 60


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True)
class View:
    id: int
    camera_id: str
    name: str
    created_at: str


@dataclass(frozen=True)
class Exemplar:
    id: int
    view_id: int
    frame_path: str
    is_reference: bool
    brightness: float
    ref_homography: list[list[float]] | None = None


@dataclass(frozen=True)
class Zone:
    id: int
    view_id: int
    name: str
    points: list[tuple[float, float]]
    band_near: float
    band_far: float
    min_gap_cars: float | None
    updated_at: str


class Repository:
    """Thread-safe in-memory state for one browser session."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._views: dict[int, View] = {}
        self._exemplars: dict[int, Exemplar] = {}
        self._zones: dict[int, Zone] = {}
        self._samples: dict[int, list[tuple[float, float]]] = {}
        self._next_view = 1
        self._next_exemplar = 1
        self._next_zone = 1

    def create_view(self, camera_id: str, name: str) -> View:
        with self._lock:
            view = View(self._next_view, camera_id, name, _now())
            self._views[view.id] = view
            self._next_view += 1
            return view

    def get_view(self, view_id: int) -> View | None:
        with self._lock:
            return self._views.get(view_id)

    def list_views(self, camera_id: str) -> list[View]:
        with self._lock:
            return [v for v in self._views.values() if v.camera_id == camera_id]

    def all_views(self) -> list[View]:
        with self._lock:
            return list(self._views.values())

    def rename_view(self, view_id: int, name: str) -> View | None:
        with self._lock:
            view = self._views.get(view_id)
            if view is None:
                return None
            renamed = View(view.id, view.camera_id, name, view.created_at)
            self._views[view_id] = renamed
            return renamed

    def delete_view(self, view_id: int) -> bool:
        with self._lock:
            if self._views.pop(view_id, None) is None:
                return False
            self._exemplars = {i: e for i, e in self._exemplars.items() if e.view_id != view_id}
            for zone in self.list_zones(view_id):
                self._zones.pop(zone.id, None)
                self._samples.pop(zone.id, None)
            return True

    def add_exemplar(
        self, view_id: int, frame_path: str, brightness: float,
        is_reference: bool = False,
        ref_homography: list[list[float]] | None = None,
    ) -> Exemplar:
        with self._lock:
            if is_reference:
                self._exemplars = {
                    i: Exemplar(
                        e.id, e.view_id, e.frame_path, False, e.brightness, e.ref_homography
                    )
                    if e.view_id == view_id else e
                    for i, e in self._exemplars.items()
                }
            ex = Exemplar(
                self._next_exemplar, view_id, frame_path, is_reference, brightness,
                ref_homography,
            )
            self._exemplars[ex.id] = ex
            self._next_exemplar += 1
            return ex

    def list_exemplars(self, view_id: int) -> list[Exemplar]:
        with self._lock:
            return sorted(
                (e for e in self._exemplars.values() if e.view_id == view_id),
                key=lambda e: (not e.is_reference, e.id),
            )

    def delete_exemplar(self, exemplar_id: int) -> None:
        with self._lock:
            self._exemplars.pop(exemplar_id, None)

    def all_exemplar_paths(self) -> set[str]:
        with self._lock:
            return {e.frame_path for e in self._exemplars.values()}

    def create_zone(
        self, view_id: int, name: str, points: list[tuple[float, float]],
        band_near: float, band_far: float, min_gap_cars: float | None = None,
    ) -> Zone:
        with self._lock:
            zone = Zone(
                self._next_zone, view_id, name, points, band_near, band_far,
                min_gap_cars, _now(),
            )
            self._zones[zone.id] = zone
            self._next_zone += 1
            return zone

    def get_zone(self, zone_id: int) -> Zone | None:
        with self._lock:
            return self._zones.get(zone_id)

    def list_zones(self, view_id: int) -> list[Zone]:
        with self._lock:
            return [z for z in self._zones.values() if z.view_id == view_id]

    def update_zone(self, zone_id: int, **fields: object) -> Zone | None:
        with self._lock:
            zone = self._zones.get(zone_id)
            if zone is None:
                return None
            allowed = {"name", "points", "band_near", "band_far", "min_gap_cars"}
            if unknown := fields.keys() - allowed:
                raise ValueError(f"unknown zone fields: {unknown}")
            if "points" in fields:
                self._samples.pop(zone_id, None)
            updated = Zone(**{**asdict(zone), **fields, "updated_at": _now()})
            self._zones[zone_id] = updated
            return updated

    def delete_zone(self, zone_id: int) -> bool:
        with self._lock:
            if self._zones.pop(zone_id, None) is None:
                return False
            self._samples.pop(zone_id, None)
            return True

    def add_length_samples(self, zone_id: int, samples: list[tuple[float, float]]) -> None:
        if not samples:
            return
        with self._lock:
            self._samples[zone_id] = (
                self._samples.get(zone_id, []) + samples
            )[-MAX_LENGTH_SAMPLES:]

    def length_samples(self, zone_id: int) -> list[tuple[float, float]]:
        with self._lock:
            return list(self._samples.get(zone_id, []))

    def export(self) -> dict:
        with self._lock:
            return {
                "views": [asdict(v) for v in self._views.values()],
                "exemplars": [asdict(e) for e in self._exemplars.values()],
                "zones": [asdict(z) for z in self._zones.values()],
                "samples": {str(k): v for k, v in self._samples.items()},
            }

    def restore(self, data: dict) -> None:
        """Replace a fresh session with a validated browser snapshot."""
        with self._lock:
            views = {raw["id"]: View(**raw) for raw in data["views"]}
            exemplars = {raw["id"]: Exemplar(**raw) for raw in data["exemplars"]}
            zones = {raw["id"]: Zone(**raw) for raw in data["zones"]}
            if (
                len(views) != len(data["views"])
                or len(exemplars) != len(data["exemplars"])
                or len(zones) != len(data["zones"])
            ):
                raise ValueError("snapshot contains duplicate ids")
            if any(e.view_id not in views for e in exemplars.values()) or any(
                z.view_id not in views for z in zones.values()
            ):
                raise ValueError("snapshot contains orphan records")
            self._views, self._exemplars, self._zones = views, exemplars, zones
            self._samples = {
                int(k): [tuple(x) for x in vals][-MAX_LENGTH_SAMPLES:]
                for k, vals in data["samples"].items() if int(k) in zones
            }
            self._next_view = max(views, default=0) + 1
            self._next_exemplar = max(exemplars, default=0) + 1
            self._next_zone = max(zones, default=0) + 1
