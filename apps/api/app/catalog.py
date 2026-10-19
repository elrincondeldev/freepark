"""Directory of public traffic cameras published by city open-data portals.

Each city has a loader that turns its portal's listing into catalog entries. An entry's
`input` is what `/api/cameras/probe` accepts to add the camera (a Vigo id or a direct
JPEG URL), so the browser never has to find or paste a source URL itself.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from xml.etree import ElementTree

import httpx

from app.camera_ids import InvalidCameraId, normalize_camera_id, normalize_source_url

log = logging.getLogger(__name__)

CACHE_SECONDS = 6 * 60 * 60
MAX_LISTING_BYTES = 8 * 1024 * 1024
USER_AGENT = "FreePark/0.1 (+https://getfreepark.com)"


class CatalogError(Exception):
    """A city's camera listing could not be loaded."""


@dataclass(frozen=True)
class CatalogCamera:
    id: str
    name: str
    lat: float
    lon: float
    input: str
    preview_url: str

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lon": self.lon,
            "input": self.input,
            "previewUrl": self.preview_url,
        }


Loader = Callable[[bytes, str], list[CatalogCamera]]


@dataclass(frozen=True)
class City:
    id: str
    name: str
    country: str
    lat: float
    lon: float
    provider: str
    listing_url: str
    load: Loader
    # "city": street cameras of one city; "country": road cameras across a whole country
    scope: str = "city"

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "country": self.country,
            "lat": self.lat,
            "lon": self.lon,
            "provider": self.provider,
            "scope": self.scope,
        }


_SMALL_WORDS = {"a", "al", "con", "de", "del", "el", "en", "la", "las", "los", "y"}


def _title(name: str) -> str:
    """`PLAZA DE CASTILLA (NORTE)` -> `Plaza de Castilla (Norte)`; mixed case is kept."""
    name = " ".join(name.split())
    if name != name.upper():
        return name
    words, previous = [], ""
    for word in name.lower().split(" "):
        if word in _SMALL_WORDS and previous[-1:].isalnum():
            words.append(word)
        else:
            words.append(re.sub(r"[^\W\d_]", lambda m: m.group().upper(), word, count=1))
        previous = word
    return " ".join(words)


def _public_url(raw: str) -> str | None:
    try:
        return normalize_source_url(raw)
    except InvalidCameraId:
        return None


def load_vigo(body: bytes, preview_template: str) -> list[CatalogCamera]:
    cameras = []
    for item in json.loads(body):
        try:
            camera_id = normalize_camera_id(str(item["id"]))
            lat, lon = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError, InvalidCameraId):
            continue
        cameras.append(CatalogCamera(
            id=camera_id,
            name=_title(str(item.get("nombre") or f"Camera {camera_id}")),
            lat=lat, lon=lon,
            input=camera_id,
            preview_url=preview_template.format(id=camera_id),
        ))
    return cameras


_KML = "{http://earth.google.com/kml/2.2}"
_IMG_RE = re.compile(r"src=['\"]?(https?://[^\s'\"<>]+?\.jpe?g)", re.IGNORECASE)


def load_madrid(body: bytes, _template: str) -> list[CatalogCamera]:
    root = ElementTree.fromstring(body.decode("utf-8-sig"))
    cameras = []
    for mark in root.iter(f"{_KML}Placemark"):
        data = {
            d.get("name"): (d.findtext(f"{_KML}Value") or "").strip()
            for d in mark.iter(f"{_KML}Data")
        }
        image = _IMG_RE.search(mark.findtext(f"{_KML}description") or "")
        coords = (mark.findtext(f".//{_KML}coordinates") or "").strip().split(",")
        url = _public_url(image.group(1)) if image else None
        if not url or len(coords) < 2:
            continue
        try:
            lon, lat = float(coords[0]), float(coords[1])
        except ValueError:
            continue
        number = data.get("Numero") or url.rsplit("/", 1)[-1]
        cameras.append(CatalogCamera(
            id=f"madrid-{number}",
            name=_title(data.get("Nombre") or f"Cámara {number}"),
            lat=lat, lon=lon, input=url, preview_url=url,
        ))
    return cameras


def load_malaga(body: bytes, _template: str) -> list[CatalogCamera]:
    cameras = []
    for feature in json.loads(body)["features"]:
        props = feature.get("properties") or {}
        url = _public_url(props.get("URLIMAGEN") or "")
        try:
            lon, lat = (float(v) for v in feature["geometry"]["coordinates"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        if not url:
            continue
        code = str(props.get("NOMBRE") or "").split("-", 1)
        name = (props.get("DESCRIPCION") or "").strip().rstrip(".").strip()
        cameras.append(CatalogCamera(
            id=f"malaga-{props.get('ID') or code[0]}",
            name=_title(" ".join(name.split()) or code[-1]),
            lat=lat, lon=lon, input=url, preview_url=url,
        ))
    return cameras


_DATEX = {
    "fs": "http://levelC/schema/3/faultAndStatus",
    "fse": "http://levelC/schema/3/faultAndStatusSpanishExtension",
    "loc": "http://levelC/schema/3/locationReferencing",
    "lse": "http://levelC/schema/3/locationReferencingSpanishExtension",
}


def _datex(element: ElementTree.Element, prefix: str, tag: str, nested: bool = True) -> str:
    path = f"{'.//' if nested else ''}{{{_DATEX[prefix]}}}{tag}"
    return (element.findtext(path) or "").strip()


def _province(raw: str) -> str:
    """`CORUÑA, A` -> `A Coruña`, `VALENCIA/VALÈNCIA` -> `Valencia`."""
    name = raw.split("/")[0].strip()
    if ", " in name:
        rest, article = name.rsplit(", ", 1)
        name = f"{article} {rest}"
    return _title(name)


def load_dgt(body: bytes, _template: str) -> list[CatalogCamera]:
    """DGT DATEX II device publication: road cameras on the national network."""
    root = ElementTree.fromstring(body)
    cameras = []
    for device in root.iter(f"{{{_DATEX['fs']}}}device"):
        if _datex(device, "fs", "typeOfDevice", nested=False) != "camera":
            continue
        url = _public_url(_datex(device, "fse", "deviceUrl"))
        try:
            lat = float(_datex(device, "loc", "latitude"))
            lon = float(_datex(device, "loc", "longitude"))
        except ValueError:
            continue
        if not url:
            continue
        road = _datex(device, "loc", "roadName")
        km = _datex(device, "lse", "kilometerPoint")
        towards = _datex(device, "loc", "roadDestination")
        province = _province(_datex(device, "lse", "province"))
        name = " ".join(part for part in (road, f"km {km}" if km else "") if part) or "Camera"
        if towards:
            name += f" → {_title(towards)}"
        if province:
            name += f" · {province}"
        cameras.append(CatalogCamera(
            id=f"dgt-{device.get('id') or url}", name=name,
            lat=lat, lon=lon, input=url, preview_url=url,
        ))
    return cameras


CITIES: tuple[City, ...] = (
    City(
        "vigo", "Vigo", "Spain", 42.2328, -8.7226, "Concello de Vigo open data",
        "https://datos.vigo.org/data/trafico/camaras-trafico.json", load_vigo,
    ),
    City(
        "madrid", "Madrid", "Spain", 40.4168, -3.7038, "Ayuntamiento de Madrid open data",
        "https://datos.madrid.es/egob/catalogo/202088-0-trafico-camaras.kml", load_madrid,
    ),
    City(
        "malaga", "Málaga", "Spain", 36.7213, -4.4214, "Ayuntamiento de Málaga open data",
        "https://datosabiertos.malaga.eu/recursos/transporte/trafico/"
        "da_camarasTrafico-4326.geojson",
        load_malaga,
    ),
    City(
        "spain-roads", "All of Spain", "Spain", 40.2, -3.7, "DGT road cameras",
        "https://nap.dgt.es/datex2/v3/dgt/DevicePublication/camaras_datex2_v36.xml",
        load_dgt, scope="country",
    ),
)


class CameraCatalog:
    """Loads each city's listing on demand and keeps it for a few hours."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        preview_template: str,
        timeout: float = 20.0,
        cities: tuple[City, ...] = CITIES,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._http = http
        self._template = preview_template
        self._timeout = timeout
        self._clock = clock
        self.cities = {city.id: city for city in cities}
        self._cache: dict[str, tuple[float, list[CatalogCamera]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def cameras(self, city_id: str) -> list[CatalogCamera]:
        city = self.cities[city_id]
        cached = self._cache.get(city_id)
        if cached and cached[0] > self._clock():
            return cached[1]
        async with self._locks.setdefault(city_id, asyncio.Lock()):
            cached = self._cache.get(city_id)
            if cached and cached[0] > self._clock():
                return cached[1]
            try:
                cameras = await self._load(city)
            except CatalogError:
                if cached:  # serve the stale listing rather than nothing
                    return cached[1]
                raise
            self._cache[city_id] = (self._clock() + CACHE_SECONDS, cameras)
            return cameras

    async def _load(self, city: City) -> list[CatalogCamera]:
        try:
            response = await self._http.get(
                city.listing_url, headers={"User-Agent": USER_AGENT}, timeout=self._timeout
            )
        except httpx.HTTPError as exc:
            log.warning("camera listing for %s failed: %s", city.id, exc.__class__.__name__)
            raise CatalogError(f"{city.name} listing could not be reached") from exc
        if response.status_code != 200 or len(response.content) > MAX_LISTING_BYTES:
            raise CatalogError(f"{city.name} listing returned status {response.status_code}")
        try:
            cameras = city.load(response.content, self._template)
        except (ValueError, ElementTree.ParseError, AttributeError, TypeError) as exc:
            log.warning("camera listing for %s could not be parsed: %s", city.id, exc)
            raise CatalogError(f"{city.name} listing could not be read") from exc
        if not cameras:
            raise CatalogError(f"{city.name} listing has no cameras")
        unique = {camera.id: camera for camera in cameras}
        return sorted(unique.values(), key=lambda camera: camera.name.lower())
