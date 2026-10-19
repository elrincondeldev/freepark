"""Browse public cameras by city so users can add one without hunting for its URL."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.catalog import CameraCatalog, CatalogError

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


def _catalog(request: Request) -> CameraCatalog:
    return request.app.state.catalog


@router.get("/cities")
def list_cities(request: Request) -> list[dict]:
    return [city.to_json() for city in _catalog(request).cities.values()]


@router.get("/cities/{city_id}/cameras")
async def list_city_cameras(city_id: str, request: Request) -> dict:
    catalog = _catalog(request)
    city = catalog.cities.get(city_id)
    if city is None:
        raise HTTPException(404, "city not found")
    try:
        cameras = await catalog.cameras(city_id)
    except CatalogError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"city": city.to_json(), "cameras": [camera.to_json() for camera in cameras]}
