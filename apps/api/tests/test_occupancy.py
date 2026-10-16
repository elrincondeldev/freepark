import numpy as np
import pytest

from app.db import Zone
from app.detection import Detection
from app.geometry import Polyline, complement, merge_intervals
from app.occupancy import (
    BINS,
    FrameGeometry,
    Smoother,
    ZoneShape,
    assign,
    bins_free,
    evaluate_zones,
    free_runs,
    map_zone,
)

GEOM = FrameGeometry(384, 216)
IDENTITY = np.eye(3)
# horizontal curb line along y=0.8, from x=0.1 to x=0.9 → 307.2 px long
BAND = 0.03  # half-width = 11.52 px; fallback car length = 2.2 * 2 * 11.52 ≈ 50.7 px


def zone(points=((0.1, 0.8), (0.9, 0.8)), band_near=BAND, band_far=BAND, min_gap=None, zid=1):
    return Zone(zid, 1, f"Z{zid}", [tuple(p) for p in points], band_near, band_far, min_gap, "t")


def car(x_center: float, width: float = 0.1, bottom: float = 0.81, height: float = 0.08):
    return Detection(
        "car", 0.9, (x_center - width / 2, bottom - height, x_center + width / 2, bottom)
    )


def px(det: Detection) -> np.ndarray:
    return GEOM.to_px(np.array(det.box).reshape(2, 2)).reshape(4)


def evaluate(dets, zones=None, smoother=None, lengths=None, margin=1.15):
    zones = zones or [zone()]
    return evaluate_zones(
        "47", 1, zones, lengths or {}, IDENTITY, dets, GEOM, smoother or Smoother(1), margin
    )


# --- polyline -------------------------------------------------------------------


def test_polyline_projection_and_band_interpolation():
    line = Polyline(np.array([[0, 0], [100, 0], [100, 50]]), band_near=10, band_far=4)
    assert line.length == 150
    p = line.project(np.array([50, 3]))
    assert p.s == pytest.approx(50) and p.distance == pytest.approx(3)
    p = line.project(np.array([104, 30]))
    assert p.s == pytest.approx(130) and p.distance == pytest.approx(4)
    assert line.band(0) == 10 and line.band(150) == 4 and line.band(75) == pytest.approx(7)
    poly = line.band_polygon(0, 150)
    assert len(poly) == 6  # three samples (incl. inner vertex) on each side


def test_interval_helpers():
    assert merge_intervals([(5, 8), (1, 3), (2, 4)]) == [(1, 4), (5, 8)]
    assert complement([(10, 20), (15, 30)], 50) == [(0, 10), (30, 50)]
    assert complement([], 5) == [(0, 5)]
    assert free_runs(np.array([1, 1, 0, 1, 0, 0, 1], bool)) == [(0, 2), (3, 4), (6, 7)]


# --- assignment -----------------------------------------------------------------


def shapes(*zones):
    return [map_zone(z, IDENTITY, GEOM, []) for z in zones]


def test_car_inside_band_is_assigned():
    a = assign(shapes(zone()), [px(car(0.5))])[0]
    assert a.zone_index == 0
    s0, s1 = a.interval
    assert s1 - s0 == pytest.approx(0.1 * 384, abs=0.5)


def test_car_straddling_line_is_assigned():
    # box bottom a few px past the line, still inside the tolerance band
    a = assign(shapes(zone()), [px(car(0.5, bottom=0.83))])[0]
    assert a.zone_index == 0


def test_car_in_lane_is_not_assigned():
    a = assign(shapes(zone()), [px(car(0.5, bottom=0.95))])[0]
    assert a.zone_index is None and a.interval is None


def test_nearest_zone_wins():
    z1 = zone(zid=1)
    z2 = zone(points=((0.1, 0.84), (0.9, 0.84)), zid=2)
    a = assign(shapes(z1, z2), [px(car(0.5, bottom=0.845))])[0]
    assert a.zone_index == 1


def test_homography_moves_zone():
    shift = np.array([[1, 0, 0.0], [0, 1, 0.1], [0, 0, 1]])  # camera tilted: curb now at y=0.9
    shape = map_zone(zone(), shift, GEOM, [])
    assert shape.line.points[0][1] == pytest.approx(0.9 * 216)


# --- gaps -----------------------------------------------------------------------


def test_empty_zone_reports_estimated_spaces():
    results, vehicle_zones = evaluate([])
    (r,) = results
    assert vehicle_zones == []
    assert len(r.available) == 1
    # 307.2 px / 50.7 px per car / 1.15 margin ≈ 5.27 → 5 spaces
    assert r.spaces == 5


def test_gap_of_one_and_a_bit_cars_is_one_space():
    # cars 38.4 px wide; fallback car length 50.7 px; leave a ~66 px (1.3 car) gap
    left_edge = 0.1
    cars = [car(left_edge + 0.05), car(left_edge + 0.15)]
    gap_start = left_edge + 0.2
    gap_px = 1.3 * 50.7
    next_left = gap_start + gap_px / 384
    cars += [car(next_left + 0.05 + i * 0.1) for i in range(5) if next_left + 0.1 + i * 0.1 <= 0.9]
    results, vehicle_zones = evaluate(cars)
    assert all(z == 1 for z in vehicle_zones)
    (r,) = results
    spaces = [a["spaces"] for a in r.available]
    assert spaces == [1]
    assert len(r.occupied) == len(cars)


def test_gap_smaller_than_a_car_is_not_available():
    # neighbouring cars are 38.4 px apart, so one space is 38.4 px of curb
    cars = [car(0.15), car(0.25)]
    gap_px = 0.9 * 38.4
    x = 0.3 + gap_px / 384
    while x + 0.1 <= 0.9:
        cars.append(car(x + 0.05))
        x += 0.1
    results, _ = evaluate(cars)
    assert results[0].available == [] or all(a["spaces"] == 0 for a in results[0].available)
    assert results[0].spaces == 0


def test_min_gap_override_requires_more_room():
    results, _ = evaluate([], zones=[zone(min_gap=3.0)])
    assert results[0].spaces == 2  # 6.06 car lengths / 3.0


def test_learned_car_length_used_after_samples():
    z = zone()
    s = ZoneShape(
        z, map_zone(z, IDENTITY, GEOM, []).line, [(0.2, 0.125), (0.5, 0.125), (0.8, 0.125)]
    )
    assert s.car_length(150) == pytest.approx(0.125 * 307.2)
    # perspective: far end has shorter cars
    persp = ZoneShape(z, s.line, [(0.0, 0.2), (0.5, 0.15), (1.0, 0.1)])
    assert persp.car_length(0) > persp.car_length(307)


def test_space_length_learned_from_neighbour_spacing():
    results, _ = evaluate([car(0.45), car(0.55), car(0.8)])  # first two touch, third is apart
    (sample,) = results[0].length_samples
    assert sample[0] == pytest.approx(0.5, abs=0.01)
    assert sample[1] == pytest.approx(38.4 / 307.2, abs=0.01)


def test_lone_car_records_no_spacing():
    results, _ = evaluate([car(0.5)])
    assert results[0].length_samples == []


def test_angled_parking_counts_bays_by_spacing_not_box_size():
    """Angled ("en batería") parking: boxes are wide and overlap, but each car only takes
    ~19 px of curb. A 4-bay hole between two groups must show free bays."""
    pitch = 19.2 / 384  # spacing between neighbouring angled cars
    width = 0.1  # each box is twice as wide as the curb the car takes
    left = [car(0.15 + i * pitch, width=width) for i in range(4)]
    hole_start = 0.15 + 4 * pitch
    right = [car(hole_start + 4 * pitch + i * pitch, width=width) for i in range(4)]
    results, _ = evaluate(left + right)
    assert results[0].spaces >= 2


# --- smoothing ------------------------------------------------------------------


def full_row():
    return [car(0.15 + 0.1 * i) for i in range(8)]


def test_one_frame_missed_detection_never_available():
    smoother = Smoother(confirm_frames=2)
    row = full_row()
    missing = row[:3] + row[4:]
    for dets in (row, row, missing, row, row):
        results, _ = evaluate(dets, smoother=smoother)
        assert results[0].spaces == 0


def test_space_confirmed_after_two_frames():
    smoother = Smoother(confirm_frames=2)
    row = full_row()
    gap = row[:3] + row[5:]  # two cars left
    evaluate(row, smoother=smoother)
    first, _ = evaluate(gap, smoother=smoother)
    assert first[0].spaces == 0
    second, _ = evaluate(gap, smoother=smoother)
    assert second[0].spaces >= 1


def test_history_survives_other_views_but_expires():
    now = [0.0]
    smoother = Smoother(confirm_frames=2, max_age=300, clock=lambda: now[0])
    z_a = zone(zid=1)  # zone of view A
    z_b = zone(zid=2)  # zone of view B
    free = bins_free(100, [])
    assert not smoother.confirmed_free(z_a, free).any()
    now[0] += 70
    smoother.confirmed_free(z_b, free)  # camera rotated to view B in between
    now[0] += 70
    assert smoother.confirmed_free(z_a, free).all()  # back on A: second free frame confirms
    now[0] += 301
    assert not smoother.confirmed_free(z_a, free).any()  # A unseen for > 5 min: start over


def test_zone_edit_restarts_history():
    smoother = Smoother(confirm_frames=2)
    free = bins_free(100, [])
    smoother.confirmed_free(zone(), free)
    edited = zone(points=((0.1, 0.7), (0.9, 0.7)))
    assert not smoother.confirmed_free(edited, free).any()


def test_bins_free_marks_occupied():
    free = bins_free(200, [(0, 50), (150, 200)])
    assert free.sum() == BINS // 2
