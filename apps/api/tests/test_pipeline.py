"""Full analysis pipeline over real fixture frames with a fake detector."""

import cv2
import pytest

from app.config import Settings
from app.db import Repository
from app.detection import (
    Detection,
    DetectionUnavailable,
    DisabledDetector,
)
from app.frames import FrameStore, make_frame_id
from app.monitor import FrameInfo
from app.pipeline import Analyzer
from app.view_registry import ViewRegistry
from app.views import ViewMatcher
from tests.fixtures import frame_bytes, to_jpeg

# Camera 47 view A: right-hand curb, from the bottom edge up the avenue
CURB = [(0.70, 0.98), (0.62, 0.70), (0.56, 0.48)]
PARKED = [
    Detection("car", 0.9, (0.66, 0.80, 0.78, 0.97)),  # nearest car, on the curb
    Detection("car", 0.8, (0.60, 0.55, 0.67, 0.68)),  # further up the curb
    Detection("car", 0.7, (0.30, 0.50, 0.38, 0.60)),  # in the traffic lane
]


class ScriptedDetector:
    def __init__(self, detections=PARKED):
        self.detections = list(detections)
        self.calls = 0
        self.error = None

    async def detect(self, jpeg):
        self.calls += 1
        if self.error:
            raise self.error
        return list(self.detections)


@pytest.fixture
def env(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path, available_confirm_frames=1)
    repo = Repository(tmp_path / "p.db")
    store = FrameStore(tmp_path, 20)
    views = ViewRegistry(repo, store, ViewMatcher(), settings.view_mask)
    view = views.create_view("47", "Avenue", frame_bytes("47_1791962972.jpg"))
    zone = repo.create_zone(view.id, "Right curb", CURB, 0.035, 0.012)
    detector = ScriptedDetector()
    analyzer = Analyzer(settings, repo, views, detector)
    return analyzer, detector, repo, view, zone


def frame(name_or_bytes, camera="47"):
    data = frame_bytes(name_or_bytes) if isinstance(name_or_bytes, str) else name_or_bytes
    return FrameInfo(camera, make_frame_id(1_791_000_000, data), "2026-10-14T07:30:00+00:00", data)


async def test_known_view_reports_occupancy(env):
    analyzer, _, repo, view, zone = env
    msg = await analyzer(frame("47_1791963184.jpg"))
    assert msg["status"] == "ok"
    assert msg["viewId"] == view.id and msg["viewName"] == "Avenue"
    assert msg["viewConfidence"] > 0.3
    zone_ids = [v["zoneId"] for v in msg["vehicles"]]
    assert zone_ids == [zone.id, zone.id, None]  # lane vehicle not counted
    (z,) = msg["zones"]
    assert z["zoneId"] == zone.id and len(z["occupied"]) == 2
    assert msg["totalAvailable"] == z["spaces"] >= 1
    for a in z["available"]:
        assert all(0 <= x <= 1 and 0 <= y <= 1 for x, y in a["polygon"])
    assert repo.length_samples(zone.id) == []  # cars are not neighbours: no spacing learned


async def test_unknown_view_has_vehicles_but_no_availability(env):
    analyzer, *_ = env
    msg = await analyzer(frame("47_1791963327.jpg"))  # camera rotated to view B
    assert msg["status"] == "unknown_view"
    assert msg["viewId"] is None
    assert len(msg["vehicles"]) == 3 and msg["zones"] == []
    assert msg["totalAvailable"] is None


async def test_low_quality_frame_skips_prediction(env):
    analyzer, detector, *_ = env
    img = cv2.imread("tests/fixtures/frames/47_1791963184.jpg")
    blurred = to_jpeg(cv2.GaussianBlur(img, (0, 0), 4))
    msg = await analyzer(frame(blurred))
    assert msg["status"] == "low_quality" and msg["totalAvailable"] is None
    assert detector.calls == 0


async def test_missing_token_reports_analysis_disabled(env):
    analyzer, *_ = env
    analyzer._detector = DisabledDetector()
    msg = await analyzer(frame("47_1791963184.jpg"))
    assert msg["status"] == "analysis_disabled"
    assert msg["totalAvailable"] is None and msg["vehicles"] == []


async def test_model_failure_reports_analysis_unavailable(env):
    analyzer, detector, *_ = env
    detector.error = DetectionUnavailable("rate limited")
    msg = await analyzer(frame("47_1791963184.jpg"))
    assert msg["status"] == "analysis_unavailable" and msg["reason"] == "rate limited"
    detector.error = None
    msg = await analyzer(frame("47_1791963256.jpg"))  # next new frame retries
    assert msg["status"] == "ok"


async def test_reanalysis_reuses_detections(env):
    analyzer, detector, repo, _, zone = env
    f = frame("47_1791963184.jpg")
    await analyzer(f)
    repo.delete_zone(zone.id)
    msg = await analyzer(f)  # same frame again after zones changed
    assert detector.calls == 1
    assert msg["zones"] == [] and msg["totalAvailable"] is None


async def test_view_without_zones_reports_null_total(env):
    analyzer, _, repo, _, zone = env
    repo.delete_zone(zone.id)
    msg = await analyzer(frame("47_1791963184.jpg"))
    assert msg["status"] == "ok" and msg["totalAvailable"] is None
