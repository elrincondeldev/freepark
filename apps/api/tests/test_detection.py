import asyncio
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.config import Settings
from app.detection import (
    DetectionDisabled,
    DetectionUnavailable,
    DisabledDetector,
    FakeDetector,
    ReplicateDetector,
    build_detector,
    build_input,
    normalise_class,
    parse_grounding_dino,
    parse_yolo,
)


def jpeg(w=384, h=216) -> bytes:
    img = np.full((h, w, 3), 128, np.uint8)
    return cv2.imencode(".jpg", img)[1].tobytes()


GD_TEMPLATE = '{"image": "{image}", "query": "car . van", "box_threshold": 0.25}'


class FakeReplicateError(Exception):
    def __init__(self, status, detail):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def make(runner, **kw):
    return ReplicateDetector(runner, "owner/model:v", GD_TEMPLATE, "grounding_dino", **kw)


def test_build_input_substitutes_image():
    payload = build_input('{"a": "{image}", "b": ["{image}", 1], "c": {"d": "{image}"}}', "URI")
    assert payload == {"a": "URI", "b": ["URI", 1], "c": {"d": "URI"}}


@pytest.mark.parametrize(
    ("label", "cls"),
    [("car", "car"), ("car van", "car"), ("Truck", "truck"), ("person", None), ("bus,", "bus")],
)
def test_normalise_class(label, cls):
    assert normalise_class(label) == cls


def test_parse_grounding_dino_normalises_and_filters():
    out = {
        "detections": [
            {"bbox": [384, 216, 768, 432], "label": "car", "confidence": 0.7},
            {"bbox": [0, 0, 10, 10], "label": "person", "confidence": 0.9},
            {"bbox": [10, 10, 10, 20], "label": "car", "confidence": 0.9},  # degenerate
        ]
    }
    dets = parse_grounding_dino(out, 768, 432)
    assert len(dets) == 1
    assert dets[0].cls == "car" and dets[0].box == (0.5, 0.5, 1.0, 1.0)


def test_parse_yolo_world_json_str():
    inner = {"Det-0": {"x0": 0, "y0": 0, "x1": 384, "y1": 216, "score": 0.4, "cls": "van"}}
    dets = parse_yolo({"json_str": json.dumps(inner)}, 768, 432)
    assert dets[0].cls == "van" and dets[0].box == (0.0, 0.0, 0.5, 0.5)


async def test_replicate_detector_parses_and_filters_confidence():
    seen = {}

    async def runner(model, payload):
        seen["model"], seen["payload"] = model, payload
        return {
            "detections": [
                {"bbox": [0, 0, 384, 216], "label": "car", "confidence": 0.8},
                {"bbox": [0, 0, 100, 100], "label": "car", "confidence": 0.1},
            ]
        }

    det = make(runner, upscale=2.0, min_confidence=0.3)
    dets = await det.detect(jpeg())
    assert len(dets) == 1
    assert dets[0].box == pytest.approx((0, 0, 0.5, 0.5))
    assert seen["model"] == "owner/model:v"
    assert seen["payload"]["image"].startswith("data:image/jpeg;base64,")
    # upscaled ×2 before upload
    raw = seen["payload"]["image"].split(",", 1)[1]
    import base64

    img = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[:2] == (432, 768)


async def test_long_rate_limit_blocks_until_retry_after():
    now = [100.0]
    calls = []

    async def runner(model, payload):
        calls.append(1)
        raise FakeReplicateError(429, "throttled. Your rate limit resets in ~45s.")

    det = make(runner, clock=lambda: now[0], max_rate_limit_wait=20)
    with pytest.raises(DetectionUnavailable, match="rate limited"):
        await det.detect(jpeg())
    with pytest.raises(DetectionUnavailable, match="rate limited"):
        await det.detect(jpeg())
    assert len(calls) == 1  # second call short-circuited, no request sent
    now[0] += 46
    with pytest.raises(DetectionUnavailable):
        await det.detect(jpeg())
    assert len(calls) == 2


async def test_short_rate_limit_is_waited_out_and_retried():
    now = [100.0]
    slept = []
    responses = [
        FakeReplicateError(429, "throttled. Your rate limit resets in ~9s."),
        {"detections": []},
    ]

    async def runner(model, payload):
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    async def fake_sleep(seconds):
        slept.append(seconds)
        now[0] += seconds

    det = make(runner, clock=lambda: now[0], sleep=fake_sleep)
    assert await det.detect(jpeg()) == []
    assert slept == [pytest.approx(9)]


async def test_oversized_boxes_dropped():
    async def runner(model, payload):
        return {
            "detections": [
                {"bbox": [0, 0, 700, 400], "label": "car", "confidence": 0.9},
                {"bbox": [0, 0, 50, 50], "label": "car", "confidence": 0.9},
            ]
        }

    dets = await make(runner, max_box_area=0.2).detect(jpeg())
    assert len(dets) == 1


async def test_timeout_is_unavailable():
    async def runner(model, payload):
        await asyncio.sleep(1)

    det = make(runner, timeout=0.01)
    with pytest.raises(DetectionUnavailable, match="timed out"):
        await det.detect(jpeg())


async def test_failure_and_bad_output_are_unavailable():
    async def failing(model, payload):
        raise RuntimeError("boom")

    with pytest.raises(DetectionUnavailable, match="failed"):
        await make(failing).detect(jpeg())

    async def garbage(model, payload):
        return {"detections": [{"label": "car"}]}

    assert await make(garbage).detect(jpeg()) == []


async def test_concurrency_is_bounded():
    active, peak = 0, 0

    async def runner(model, payload):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.02)
        active -= 1
        return {"detections": []}

    det = make(runner, max_concurrent=2)
    await asyncio.gather(*(det.detect(jpeg()) for _ in range(6)))
    assert peak == 2


async def test_disabled_detector_and_factory(tmp_path):
    s = Settings(_env_file=None, detector="replicate", replicate_api_token=None)
    det = build_detector(s)
    assert isinstance(det, DisabledDetector)
    with pytest.raises(DetectionDisabled):
        await det.detect(jpeg())
    assert isinstance(build_detector(Settings(_env_file=None, detector="fake")), FakeDetector)


async def test_fake_detector_fixture_and_determinism(tmp_path):
    fixture = tmp_path / "fake.json"
    fixture.write_text(json.dumps({"*": [{"cls": "car", "conf": 0.9, "box": [0, 0, 0.1, 0.1]}]}))
    dets = await FakeDetector(Path(fixture)).detect(jpeg())
    assert dets[0].box == (0, 0, 0.1, 0.1)
    fake = FakeDetector()
    assert await fake.detect(jpeg()) == await fake.detect(jpeg())
