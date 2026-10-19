"""Transfer the browser-owned configuration into a temporary analysis session."""

from __future__ import annotations

import base64
import binascii
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.camera_ids import normalize_camera_id
from app.services import Services, get_services
from app.view_registry import decode_gray

router = APIRouter(prefix="/api/state", tags=["state"])
MAX_SNAPSHOT_BYTES = 24 * 1024 * 1024
MAX_IMAGE_BYTES = 2 * 1024 * 1024
Svc = Annotated[Services, Depends(get_services)]


@router.get("/status")
def state_status(svc: Svc) -> dict[str, bool]:
    return {"initialized": svc.initialized}


class SnapshotRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class StoredView(SnapshotRecord):
    id: int = Field(gt=0)
    camera_id: str = Field(min_length=1, max_length=26)
    name: str = Field(min_length=1, max_length=80)
    created_at: str = Field(min_length=1, max_length=64)

    @field_validator("camera_id")
    @classmethod
    def valid_camera(cls, value: str) -> str:
        if normalize_camera_id(value) != value:
            raise ValueError("camera id is not normalized")
        return value


class StoredExemplar(SnapshotRecord):
    id: int = Field(gt=0)
    view_id: int = Field(gt=0)
    image: str = Field(min_length=1)
    is_reference: bool
    brightness: float = Field(ge=0, le=255)
    ref_homography: list[list[float]] | None = None

    @field_validator("ref_homography")
    @classmethod
    def valid_homography(cls, value: list[list[float]] | None) -> list[list[float]] | None:
        if value is not None and (len(value) != 3 or any(len(row) != 3 for row in value)):
            raise ValueError("homography must be 3x3")
        return value


class StoredZone(SnapshotRecord):
    id: int = Field(gt=0)
    view_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=80)
    points: list[tuple[float, float]] = Field(min_length=2, max_length=64)
    band_near: float = Field(gt=0, le=0.25)
    band_far: float = Field(gt=0, le=0.25)
    min_gap_cars: float | None = Field(default=None, ge=0.8, le=5)
    updated_at: str = Field(min_length=1, max_length=64)

    @field_validator("points")
    @classmethod
    def valid_points(cls, value: list[tuple[float, float]]) -> list[tuple[float, float]]:
        if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in value):
            raise ValueError("point coordinates must be within [0, 1]")
        return value


class StoredState(SnapshotRecord):
    views: list[StoredView] = Field(max_length=100)
    exemplars: list[StoredExemplar] = Field(max_length=500)
    zones: list[StoredZone] = Field(max_length=1000)
    samples: dict[str, list[tuple[float, float]]] = Field(max_length=1000)

    @field_validator("samples")
    @classmethod
    def valid_samples(
        cls, value: dict[str, list[tuple[float, float]]]
    ) -> dict[str, list[tuple[float, float]]]:
        if any(
            len(samples) > 60 or any(not (0 <= s <= 1 and length > 0) for s, length in samples)
            for samples in value.values()
        ):
            raise ValueError("invalid length samples")
        return value


@router.get("")
def export_state(svc: Svc) -> dict:
    snapshot = svc.repo.export()
    for exemplar in snapshot["exemplars"]:
        path = svc.store.exemplar_path(exemplar["frame_path"])
        if not path.is_file():
            raise HTTPException(500, "reference image missing")
        exemplar["image"] = base64.b64encode(path.read_bytes()).decode()
        exemplar.pop("frame_path")
    return snapshot


@router.post("")
async def restore_state(request: Request, svc: Svc) -> dict:
    if not svc.client_id:
        raise HTTPException(400, "client id required")
    raw = await request.body()
    if len(raw) > MAX_SNAPSHOT_BYTES:
        raise HTTPException(413, "snapshot too large")
    old_cameras = {view.camera_id for view in svc.repo.all_views()}
    old_paths = svc.repo.all_exemplar_paths()
    new_paths: list[str] = []
    try:
        import json

        data = StoredState.model_validate(json.loads(raw)).model_dump()
        images: list[bytes] = []
        for exemplar in data["exemplars"]:
            image = base64.b64decode(exemplar.pop("image"), validate=True)
            if not image or len(image) > MAX_IMAGE_BYTES:
                raise ValueError("invalid exemplar image size")
            decode_gray(image)
            images.append(image)
            exemplar["frame_path"] = ""  # replaced with a server-local path below
        # Validate references before writing any files.
        from app.repository import Repository

        staged = Repository()
        staged.restore(data)
        for exemplar, image in zip(data["exemplars"], images, strict=True):
            exemplar["frame_path"] = svc.store.save_exemplar(exemplar["view_id"], image)
            new_paths.append(exemplar["frame_path"])
        svc.repo.restore(data)
        svc.initialized = True
    except (ValueError, KeyError, TypeError, binascii.Error, ValidationError) as exc:
        for path in new_paths:
            svc.store.exemplar_path(path).unlink(missing_ok=True)
        raise HTTPException(400, f"invalid snapshot: {exc}") from exc
    for path in old_paths - set(new_paths):
        svc.store.exemplar_path(path).unlink(missing_ok=True)
    for camera_id in old_cameras | {view.camera_id for view in svc.repo.all_views()}:
        svc.views_changed(camera_id)
    return {"views": len(data["views"]), "zones": len(data["zones"])}
