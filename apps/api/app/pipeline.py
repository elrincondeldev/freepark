"""Per-frame analysis: quality → view match → detection → zones → smoothing (design D4)."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from app.config import Settings
from app.detection import Detection, DetectionDisabled, DetectionUnavailable, Detector
from app.monitor import FrameInfo
from app.occupancy import FrameGeometry, Smoother, evaluate_zones
from app.quality import assess
from app.repository import Repository
from app.view_registry import ViewRegistry, decode_gray

log = logging.getLogger(__name__)


class Analyzer:
    def __init__(
        self,
        settings: Settings,
        repo: Repository,
        views: ViewRegistry,
        detector: Detector,
    ) -> None:
        self._settings = settings
        self._repo = repo
        self._views = views
        self._detector = detector
        self.smoother = Smoother(settings.available_confirm_frames)
        # last detections per camera, so re-analysing a frame (zones edited) costs no prediction
        self._detections: dict[str, tuple[str, list[Detection]]] = {}

    def _message(self, frame: FrameInfo, status: str, **extra: Any) -> dict[str, Any]:
        msg: dict[str, Any] = {
            "type": "analysis",
            "cameraId": frame.camera_id,
            "frameId": frame.frame_id,
            "capturedAt": frame.captured_at,
            "analysedAt": datetime.now(UTC).isoformat(),
            "status": status,
            "viewId": None,
            "viewName": None,
            "viewConfidence": None,
            "vehicles": [],
            "zones": [],
            "totalAvailable": None,
        }
        msg.update(extra)
        return msg

    def forget_detections(self, camera_id: str) -> None:
        """Drop cached detections so the next analysis asks the model again."""
        self._detections.pop(camera_id, None)

    async def _detect(self, frame: FrameInfo) -> list[Detection]:
        cached = self._detections.get(frame.camera_id)
        if cached and cached[0] == frame.frame_id:
            return cached[1]
        detections = await self._detector.detect(frame.data)
        self._detections[frame.camera_id] = (frame.frame_id, detections)
        return detections

    async def __call__(self, frame: FrameInfo) -> dict[str, Any]:
        s = self._settings
        gray = await asyncio.to_thread(decode_gray, frame.data)
        quality = assess(gray, s.view_mask, s.blur_threshold, s.dark_threshold)
        if not quality.ok:
            return self._message(frame, "low_quality", qualityReason=quality.reason)

        match, _ = await asyncio.to_thread(self._views.match, frame.camera_id, gray)
        view_fields: dict[str, Any] = {}
        if match is not None:
            view = self._repo.get_view(match.view_id)
            view_fields = {
                "viewId": match.view_id,
                "viewName": view.name if view else None,
                "viewConfidence": match.confidence,
            }

        try:
            detections = await self._detect(frame)
        except DetectionDisabled as exc:
            return self._message(frame, "analysis_disabled", reason=str(exc), **view_fields)
        except DetectionUnavailable as exc:
            log.info("camera %s: analysis unavailable: %s", frame.camera_id, exc)
            return self._message(frame, "analysis_unavailable", reason=str(exc), **view_fields)

        def vehicles(zone_ids: list[int | None]) -> list[dict[str, Any]]:
            return [
                {
                    "box": [round(v, 4) for v in d.box],
                    "cls": d.cls,
                    "conf": round(d.conf, 3),
                    "zoneId": zid,
                }
                for d, zid in zip(detections, zone_ids, strict=True)
            ]

        if match is None:
            return self._message(frame, "unknown_view", vehicles=vehicles([None] * len(detections)))

        zones = self._repo.list_zones(match.view_id)
        lengths = {z.id: self._repo.length_samples(z.id) for z in zones}
        h, w = gray.shape
        results, zone_ids = evaluate_zones(
            frame.camera_id,
            match.view_id,
            zones,
            lengths,
            match.homography,
            detections,
            FrameGeometry(w, h),
            self.smoother,
            s.gap_margin,
        )
        for r in results:
            self._repo.add_length_samples(r.zone_id, r.length_samples)
        await asyncio.to_thread(
            self._views.maybe_learn_exemplar, frame.camera_id, match, frame.data, gray
        )
        return self._message(
            frame,
            "ok",
            vehicles=vehicles(zone_ids),
            zones=[r.message() for r in results],
            totalAvailable=sum(r.spaces for r in results) if results else None,
            **view_fields,
        )
