from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from app.repository import Zone
from app.services import Services, get_services

router = APIRouter(prefix="/api", tags=["zones"])
Svc = Annotated[Services, Depends(get_services)]

Point = tuple[float, float]
MAX_POINTS = 64


def _check_points(points: list[Point]) -> list[Point]:
    if len(points) < 2:
        raise ValueError("a zone needs at least two points")
    if len(points) > MAX_POINTS:
        raise ValueError(f"a zone can have at most {MAX_POINTS} points")
    for x, y in points:
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            raise ValueError("point coordinates must be within [0, 1]")
    return points


class ZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    points: list[Point]
    # band half-widths as a fraction of the image width, at the first / last point
    bandNear: float = Field(gt=0, le=0.25)
    bandFar: float = Field(gt=0, le=0.25)
    minGapCars: float | None = Field(default=None, ge=0.8, le=5)

    _points = field_validator("points")(_check_points)


class ZonePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    points: list[Point] | None = None
    bandNear: float | None = Field(default=None, gt=0, le=0.25)
    bandFar: float | None = Field(default=None, gt=0, le=0.25)
    minGapCars: float | None = Field(default=None, ge=0.8, le=5)

    @field_validator("points")
    @classmethod
    def _points(cls, value: list[Point] | None) -> list[Point] | None:
        return None if value is None else _check_points(value)


def zone_out(z: Zone) -> dict:
    return {
        "id": z.id,
        "viewId": z.view_id,
        "name": z.name,
        "points": [list(p) for p in z.points],
        "bandNear": z.band_near,
        "bandFar": z.band_far,
        "minGapCars": z.min_gap_cars,
        "updatedAt": z.updated_at,
    }


def _camera_of_view(svc: Services, view_id: int) -> str:
    view = svc.repo.get_view(view_id)
    if view is None:
        raise HTTPException(404, "view not found")
    return view.camera_id


def _zone_or_404(svc: Services, zone_id: int) -> Zone:
    zone = svc.repo.get_zone(zone_id)
    if zone is None:
        raise HTTPException(404, "zone not found")
    return zone


@router.get("/views/{view_id}/zones")
def list_zones(view_id: int, svc: Svc):
    _camera_of_view(svc, view_id)
    return [zone_out(z) for z in svc.repo.list_zones(view_id)]


@router.post("/views/{view_id}/zones", status_code=201)
def create_zone(view_id: int, body: ZoneCreate, svc: Svc):
    camera_id = _camera_of_view(svc, view_id)
    zone = svc.repo.create_zone(
        view_id, body.name.strip(), body.points, body.bandNear, body.bandFar, body.minGapCars
    )
    svc.views_changed(camera_id)
    return zone_out(zone)


@router.patch("/zones/{zone_id}")
def update_zone(zone_id: int, body: ZonePatch, svc: Svc):
    zone = _zone_or_404(svc, zone_id)
    fields: dict[str, object] = {}
    sent = body.model_fields_set
    if body.name is not None:
        fields["name"] = body.name.strip()
    if body.points is not None:
        fields["points"] = body.points
    if body.bandNear is not None:
        fields["band_near"] = body.bandNear
    if body.bandFar is not None:
        fields["band_far"] = body.bandFar
    if "minGapCars" in sent:  # explicit null clears the override
        fields["min_gap_cars"] = body.minGapCars
    updated = svc.repo.update_zone(zone_id, **fields)
    svc.views_changed(_camera_of_view(svc, zone.view_id))
    return zone_out(updated)


@router.delete("/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: int, svc: Svc):
    zone = _zone_or_404(svc, zone_id)
    svc.repo.delete_zone(zone_id)
    svc.views_changed(_camera_of_view(svc, zone.view_id))
    return Response(status_code=204)
