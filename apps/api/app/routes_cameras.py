from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.camera_ids import InvalidCameraId, normalize_camera_id, parse_camera_input
from app.frames import make_frame_id
from app.services import Services, get_services
from app.source import FetchError

router = APIRouter(prefix="/api/cameras", tags=["cameras"])
Svc = Annotated[Services, Depends(get_services)]

IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}


def _camera_id(raw: str) -> str:
    try:
        return normalize_camera_id(raw)
    except InvalidCameraId as exc:
        raise HTTPException(400, str(exc)) from exc


async def _probe(svc: Services, camera_id: str) -> dict:
    try:
        fetched = await svc.fetcher.fetch(camera_id)
    except FetchError as exc:
        raise HTTPException(502, f"camera {camera_id} could not be reached: {exc}") from exc
    frame_id = make_frame_id(fetched.captured_epoch, fetched.data)
    await asyncio.to_thread(svc.store.save, camera_id, frame_id, fetched.data)
    return {
        "cameraId": camera_id,
        "frameId": frame_id,
        "capturedAt": datetime.fromtimestamp(fetched.captured_epoch, UTC).isoformat(),
        "url": f"/api/cameras/{camera_id}/frames/{frame_id}.jpg",
    }


@router.get("/probe")
async def probe_input(svc: Svc, input: Annotated[str, Query(min_length=1, max_length=300)]):
    """Resolve a pasted URL or id, then check that the camera returns an image."""
    try:
        camera_id = parse_camera_input(input)
    except InvalidCameraId as exc:
        raise HTTPException(400, str(exc)) from exc
    return await _probe(svc, camera_id)


@router.get("/{camera_id}/probe")
async def probe_camera(camera_id: str, svc: Svc):
    return await _probe(svc, _camera_id(camera_id))


@router.post("/{camera_id}/reanalyze", status_code=202)
def reanalyze(camera_id: str, svc: Svc, fresh: bool = False):
    """Re-run analysis of the latest frame of a watched camera.

    `fresh=true` asks the model again (one prediction); otherwise cached detections are
    reused and only views/zones are re-evaluated.
    """
    cam = _camera_id(camera_id)
    if fresh:
        svc.analyzer.forget_detections(cam)
    svc.views.invalidate(cam)
    if not svc.manager.requeue(cam):
        raise HTTPException(409, "camera is not being watched or has no image yet")
    return {"cameraId": cam, "queued": True, "fresh": fresh}


@router.get("/{camera_id}/frames/{frame_id}.jpg")
def get_frame(camera_id: str, frame_id: str, svc: Svc):
    path = svc.store.path(_camera_id(camera_id), frame_id)
    if path is None:
        raise HTTPException(404, "frame not found")
    return FileResponse(path, media_type="image/jpeg", headers=IMMUTABLE)
