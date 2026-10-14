"""SQLite persistence for camera views, exemplars and parking zones."""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

MIGRATIONS: list[str] = [
    # 1 — initial schema
    """
    CREATE TABLE views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_views_camera ON views(camera_id);
    CREATE TABLE view_exemplars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        frame_path TEXT NOT NULL,
        is_reference INTEGER NOT NULL DEFAULT 0,
        brightness REAL NOT NULL,
        ref_homography TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_exemplars_view ON view_exemplars(view_id);
    CREATE TABLE zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        points_json TEXT NOT NULL,
        band_near REAL NOT NULL,
        band_far REAL NOT NULL,
        min_gap_cars REAL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_zones_view ON zones(view_id);
    CREATE TABLE zone_length_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
        s REAL NOT NULL,
        length REAL NOT NULL,
        observed_at TEXT NOT NULL
    );
    CREATE INDEX idx_samples_zone ON zone_length_samples(zone_id);
    """,
]

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
    # 3x3 homography mapping normalised reference coords into this exemplar (None = identity)
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
    """Thread-safe wrapper around a single SQLite connection."""

    def __init__(self, path: Path | str) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._lock = threading.RLock()
        self.migrate()

    def close(self) -> None:
        self._conn.close()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    # --- schema -----------------------------------------------------------

    def schema_version(self) -> int:
        with self._lock:
            self._conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)")
            row = self._conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
            return row["v"] or 0

    def migrate(self) -> int:
        current = self.schema_version()
        for version, sql in enumerate(MIGRATIONS, start=1):
            if version <= current:
                continue
            with self._lock:
                self._conn.executescript(f"BEGIN; {sql}; COMMIT;")
                self._conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
                self._conn.commit()
        return self.schema_version()

    # --- views ------------------------------------------------------------

    def create_view(self, camera_id: str, name: str) -> View:
        with self._tx() as c:
            cur = c.execute(
                "INSERT INTO views (camera_id, name, created_at) VALUES (?, ?, ?)",
                (camera_id, name, _now()),
            )
            view_id = cur.lastrowid
        view = self.get_view(view_id)
        assert view is not None
        return view

    def get_view(self, view_id: int) -> View | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM views WHERE id = ?", (view_id,)).fetchone()
        return View(**dict(row)) if row else None

    def list_views(self, camera_id: str) -> list[View]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM views WHERE camera_id = ? ORDER BY id", (camera_id,)
            ).fetchall()
        return [View(**dict(r)) for r in rows]

    def rename_view(self, view_id: int, name: str) -> View | None:
        with self._tx() as c:
            c.execute("UPDATE views SET name = ? WHERE id = ?", (name, view_id))
        return self.get_view(view_id)

    def delete_view(self, view_id: int) -> bool:
        with self._tx() as c:
            cur = c.execute("DELETE FROM views WHERE id = ?", (view_id,))
        return cur.rowcount > 0

    # --- exemplars --------------------------------------------------------

    def add_exemplar(
        self,
        view_id: int,
        frame_path: str,
        brightness: float,
        is_reference: bool = False,
        ref_homography: list[list[float]] | None = None,
    ) -> Exemplar:
        with self._tx() as c:
            if is_reference:
                c.execute(
                    "UPDATE view_exemplars SET is_reference = 0 WHERE view_id = ?", (view_id,)
                )
            cur = c.execute(
                "INSERT INTO view_exemplars (view_id, frame_path, is_reference, brightness,"
                " ref_homography, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    view_id,
                    frame_path,
                    int(is_reference),
                    brightness,
                    json.dumps(ref_homography) if ref_homography is not None else None,
                    _now(),
                ),
            )
            ex_id = cur.lastrowid
        return Exemplar(ex_id, view_id, frame_path, is_reference, brightness, ref_homography)

    def list_exemplars(self, view_id: int) -> list[Exemplar]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM view_exemplars WHERE view_id = ? ORDER BY is_reference DESC, id",
                (view_id,),
            ).fetchall()
        return [
            Exemplar(
                r["id"],
                r["view_id"],
                r["frame_path"],
                bool(r["is_reference"]),
                r["brightness"],
                json.loads(r["ref_homography"]) if r["ref_homography"] else None,
            )
            for r in rows
        ]

    def delete_exemplar(self, exemplar_id: int) -> None:
        with self._tx() as c:
            c.execute("DELETE FROM view_exemplars WHERE id = ?", (exemplar_id,))

    def all_exemplar_paths(self) -> set[str]:
        with self._lock:
            rows = self._conn.execute("SELECT frame_path FROM view_exemplars").fetchall()
        return {r["frame_path"] for r in rows}

    # --- zones ------------------------------------------------------------

    def _zone(self, row: sqlite3.Row) -> Zone:
        d = dict(row)
        points = [tuple(p) for p in json.loads(d.pop("points_json"))]
        return Zone(points=points, **d)  # type: ignore[arg-type]

    def create_zone(
        self,
        view_id: int,
        name: str,
        points: list[tuple[float, float]],
        band_near: float,
        band_far: float,
        min_gap_cars: float | None = None,
    ) -> Zone:
        with self._tx() as c:
            cur = c.execute(
                "INSERT INTO zones (view_id, name, points_json, band_near, band_far, min_gap_cars,"
                " updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (view_id, name, json.dumps(points), band_near, band_far, min_gap_cars, _now()),
            )
            zone_id = cur.lastrowid
        zone = self.get_zone(zone_id)
        assert zone is not None
        return zone

    def get_zone(self, zone_id: int) -> Zone | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM zones WHERE id = ?", (zone_id,)).fetchone()
        return self._zone(row) if row else None

    def list_zones(self, view_id: int) -> list[Zone]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM zones WHERE view_id = ? ORDER BY id", (view_id,)
            ).fetchall()
        return [self._zone(r) for r in rows]

    def update_zone(self, zone_id: int, **fields: object) -> Zone | None:
        allowed = {"name", "points", "band_near", "band_far", "min_gap_cars"}
        sets, values = [], []
        for key, value in fields.items():
            if key not in allowed:
                raise ValueError(f"unknown zone field {key}")
            if key == "points":
                sets.append("points_json = ?")
                values.append(json.dumps(value))
                # geometry changed — learned car lengths no longer apply
                with self._tx() as c:
                    c.execute("DELETE FROM zone_length_samples WHERE zone_id = ?", (zone_id,))
            else:
                sets.append(f"{key} = ?")
                values.append(value)
        if sets:
            sets.append("updated_at = ?")
            values.append(_now())
            with self._tx() as c:
                c.execute(f"UPDATE zones SET {', '.join(sets)} WHERE id = ?", (*values, zone_id))
        return self.get_zone(zone_id)

    def delete_zone(self, zone_id: int) -> bool:
        with self._tx() as c:
            cur = c.execute("DELETE FROM zones WHERE id = ?", (zone_id,))
        return cur.rowcount > 0

    # --- car length samples ------------------------------------------------

    def add_length_samples(self, zone_id: int, samples: list[tuple[float, float]]) -> None:
        if not samples:
            return
        now = _now()
        with self._tx() as c:
            c.executemany(
                "INSERT INTO zone_length_samples (zone_id, s, length, observed_at)"
                " VALUES (?, ?, ?, ?)",
                [(zone_id, s, length, now) for s, length in samples],
            )
            c.execute(
                "DELETE FROM zone_length_samples WHERE zone_id = ? AND id NOT IN ("
                " SELECT id FROM zone_length_samples WHERE zone_id = ? ORDER BY id DESC LIMIT ?)",
                (zone_id, zone_id, MAX_LENGTH_SAMPLES),
            )

    def length_samples(self, zone_id: int) -> list[tuple[float, float]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT s, length FROM zone_length_samples WHERE zone_id = ? ORDER BY id",
                (zone_id,),
            ).fetchall()
        return [(r["s"], r["length"]) for r in rows]
