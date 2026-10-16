"""Occupancy on real camera scenes: Grounding DINO detections saved from the benchmark and
the zones a user drew in the app (mapped into each frame). Expected labels were checked by
eye on the frames in tests/fixtures/frames/."""

import json
from pathlib import Path

import numpy as np
import pytest

from app.db import Zone
from app.detection import Detection, suppress_duplicates
from app.occupancy import FrameGeometry, Smoother, evaluate_zones

SCENES = json.loads((Path(__file__).parent / "fixtures/detections/real_scenes.json").read_text())
GEOM = FrameGeometry(384, 216)


def run(frame: str):
    scene = SCENES[frame]
    zones = [
        Zone(
            z["id"],
            1,
            z["name"],
            [tuple(p) for p in z["points"]],
            z["band_near"],
            z["band_far"],
            None,
            "t",
        )
        for z in scene["zones"]
    ]
    dets = suppress_duplicates(
        [Detection(d["cls"], d["conf"], tuple(d["box"])) for d in scene["detections"]]
    )
    _, zone_ids = evaluate_zones("x", 1, zones, {}, np.eye(3), dets, GEOM, Smoother(1), 1.15)
    names = {z.id: z.name for z in zones}
    return {d.box: names.get(zid) for d, zid in zip(dets, zone_ids, strict=True)}


def zone_of(result, box_3x):
    """Find the detection whose box (in 3× pixel coords, as read off the frame) matches."""
    target = np.array(box_3x) / [1152, 648, 1152, 648]
    box = min(result, key=lambda b: np.abs(np.array(b) - target).sum())
    assert np.abs(np.array(box) - target).sum() < 0.02, "detection not found"
    return result[box]


@pytest.mark.parametrize(
    ("frame", "box_3x", "zone"),
    [
        # camera 47, right curb drawn along the kerb from the far end: parked cars beside it
        ("47_1791963398.jpg", (705, 423, 791, 502), "Curb 1"),  # white van
        ("47_1791963398.jpg", (786, 548, 895, 637), "Curb 1"),  # silver car
        ("47_1791963398.jpg", (860, 526, 955, 581), "Curb 1"),  # dark car
        # camera 47, left row of parked cars
        ("47_1791963398.jpg", (380, 308, 419, 335), "Curb 2"),
        ("47_1791963398.jpg", (363, 401, 426, 482), "Curb 2"),
        # camera 34, right curb
        ("34_1791962940.jpg", (783, 442, 835, 485), "Curb 1"),
        ("34_1791962940.jpg", (712, 318, 758, 361), "Curb 1"),
    ],
)
def test_parked_vehicles_occupy_their_zone(frame, box_3x, zone):
    assert zone_of(run(frame), box_3x) == zone


@pytest.mark.parametrize(
    ("frame", "box_3x"),
    [
        ("47_1791962972.jpg", (386, 434, 446, 503)),  # car driving in the lane next to parked vans
        ("34_1791962940.jpg", (696, 396, 737, 448)),  # arrow painted on the road, detected as a car
        ("47_1791963398.jpg", (512, 248, 553, 283)),  # car in the middle of the road
    ],
)
def test_traffic_and_road_markings_do_not_occupy(frame, box_3x):
    assert zone_of(run(frame), box_3x) is None


def test_angled_parking_bays_between_parked_groups_are_free():
    """Camera 003: cars park at an angle; there are empty bays between the group of white
    cars and the red cars. Space size must come from the spacing between neighbouring cars,
    not from the (overlapping, oversized) boxes — otherwise the hole looks smaller than one car."""
    scene = SCENES["003_1791993112.jpg"]
    zones = [
        Zone(
            z["id"],
            1,
            z["name"],
            [tuple(p) for p in z["points"]],
            z["band_near"],
            z["band_far"],
            None,
            "t",
        )
        for z in scene["zones"]
    ]
    dets = suppress_duplicates(
        [Detection(d["cls"], d["conf"], tuple(d["box"])) for d in scene["detections"]]
    )
    results, _ = evaluate_zones("003", 1, zones, {}, np.eye(3), dets, GEOM, Smoother(1), 1.15)
    (curb,) = results
    assert curb.spaces >= 2
    # the free stretch lies between the two groups, around the blue-marked bays
    (free,) = curb.available
    xs = [x for x, _ in free["polygon"]]
    ys = [y for _, y in free["polygon"]]
    assert min(xs) > 0.6 and max(xs) < 0.85 and min(ys) > 0.45 and max(ys) < 0.75
