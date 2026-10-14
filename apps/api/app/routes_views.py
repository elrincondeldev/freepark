from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.camera_ids import InvalidCameraId, normalize_camera_id
from app.db import View
from app.services import Services, get_services

router = APIRouter(prefix="/api", tags=["views"])
Svc = Annotated[Services, Depends(get_services)]


class ViewCreate(BaseModel):
    frameId: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)


class ViewPatch(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ReferenceUpdate(BaseModel):
    frameId: str = Field(min_length=1, max_length=64)


def _camera_id(raw: str) -> str:
    try:
        return normalize_camera_id(raw)
    except InvalidCameraId as exc:
        raise HTTPException(400, str(exc)) from exc


def _view_or_404(svc: Services, view_id: int) -> View:
    view = svc.repo.get_view(view_id)
    if view is None:
        raise HTTPException(404, "view not found")
    return view


def _frame_bytes(svc: Services, camera_id: str, frame_id: str) -> bytes:
    path = svc.store.path(camera_id, frame_id)
    if path is None:
        raise HTTPException(404, "frame not found (it may have been pruned)")
    return path.read_bytes()


def view_out(svc: Services, view: View) -> dict:
    exemplars = svc.repo.list_exemplars(view.id)
    ref = next((e for e in exemplars if e.is_reference), None)
    return {
        "id": view.id,
        "cameraId": view.camera_id,
        "name": view.name,
        "createdAt": view.created_at,
        "referenceUrl": f"/api/views/{view.id}/reference.jpg?v={ref.id}" if ref else None,
        "exemplarCount": len(exemplars),
        "zoneCount": len(svc.repo.list_zones(view.id)),
    }


@router.get("/cameras/{camera_id}/views")
def list_views(camera_id: str, svc: Svc):
    return [view_out(svc, v) for v in svc.repo.list_views(_camera_id(camera_id))]


@router.post("/cameras/{camera_id}/views", status_code=201)
def create_view(camera_id: str, body: ViewCreate, svc: Svc):
    cam = _camera_id(camera_id)
    view = svc.views.create_view(cam, body.name.strip(), _frame_bytes(svc, cam, body.frameId))
    svc.views_changed(cam)
    return view_out(svc, view)


@router.patch("/views/{view_id}")
def rename_view(view_id: int, body: ViewPatch, svc: Svc):
    _view_or_404(svc, view_id)
    view = svc.repo.rename_view(view_id, body.name.strip())
    return view_out(svc, view)


@router.delete("/views/{view_id}", status_code=204)
def delete_view(view_id: int, svc: Svc):
    view = _view_or_404(svc, view_id)
    svc.views.delete_view(view)
    svc.views_changed(view.camera_id)
    return Response(status_code=204)


@router.post("/views/{view_id}/reference")
def recapture_reference(view_id: int, body: ReferenceUpdate, svc: Svc):
    view = _view_or_404(svc, view_id)
    realigned = svc.views.recapture_reference(view, _frame_bytes(svc, view.camera_id, body.frameId))
    svc.views_changed(view.camera_id)
    return {**view_out(svc, view), "zonesRealigned": realigned}


@router.get("/views/{view_id}/reference.jpg")
def reference_image(view_id: int, svc: Svc):
    _view_or_404(svc, view_id)
    path = svc.views.reference_path(view_id)
    if path is None or not path.is_file():
        raise HTTPException(404, "reference image missing")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})
