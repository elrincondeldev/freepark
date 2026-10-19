import json

import httpx
import pytest
import respx

from app.catalog import (
    CITIES,
    CameraCatalog,
    CatalogError,
    load_dgt,
    load_madrid,
    load_malaga,
    load_vigo,
)

VIGO_URL = "https://datos.vigo.org/data/trafico/camaras-trafico.json"
VIGO_IMAGES = r"https://cams\.test/cam\.php\?id=\d+"
JPEG = b"\xff\xd8\xff\xe0" + b"img" * 20
VIGO = [
    {"id": "5", "nombre": "Castelao - Grove", "lat": 42.21836, "lon": -8.74407},
    {"id": "24", "nombre": "Policarpo Sanz - Reconquista", "lat": 42.23753, "lon": -8.72315},
    {"id": "bad", "nombre": "Broken", "lat": 0, "lon": 0},
]
MADRID = """﻿<kml xmlns="http://earth.google.com/kml/2.2"><Document>
<Placemark>
  <description>&lt;div&gt;&lt;img src=https://informo.madrid.es/cameras/Camara06303.jpg?v=15114
    width=300/&gt;&lt;/div&gt;</description>
  <ExtendedData>
    <Data name="Numero"><Value>06303</Value></Data>
    <Data name="Nombre"><Value>PLAZA DE CASTILLA (NORTE)</Value></Data>
  </ExtendedData>
  <Point><coordinates>-3.68894207537291,40.466063829633,10 </coordinates></Point>
</Placemark>
<Placemark>
  <description>no image here</description>
  <Point><coordinates>-3.6,40.4,10</coordinates></Point>
</Placemark>
</Document></kml>""".encode()
MALAGA = {"features": [
    {
        "geometry": {"coordinates": [-4.539063, 36.72406291, 0]},
        "properties": {
            "ID": 21611, "NOMBRE": "TV87-EL BONI - CAMPANILLAS",
            "DESCRIPCION": "C/ José Calderón - El Boni\r\n",
            "URLIMAGEN": "https://ctraficomovilidad.malaga.eu/recursos/movilidad/camaras_trafico/TV-87.jpg",
        },
    },
    {"geometry": {"coordinates": [-4.5, 36.7]}, "properties": {"ID": 2, "URLIMAGEN": None}},
]}
DGT = """<?xml version="1.0" encoding="UTF-8"?>
<d2:payload xmlns:d2="http://levelC/schema/3/d2Payload"
  xmlns:ns2="http://levelC/schema/3/faultAndStatus"
  xmlns:fse="http://levelC/schema/3/faultAndStatusSpanishExtension"
  xmlns:loc="http://levelC/schema/3/locationReferencing"
  xmlns:lse="http://levelC/schema/3/locationReferencingSpanishExtension">
  <ns2:device id="176130">
    <ns2:typeOfDevice>camera</ns2:typeOfDevice>
    <ns2:pointLocation>
      <loc:roadInformation>
        <loc:roadDestination>SANTIAGO DE COMPOSTELA</loc:roadDestination>
        <loc:roadName>AP-9</loc:roadName>
      </loc:roadInformation>
      <loc:pointCoordinates><loc:latitude>43.31</loc:latitude><loc:longitude>-8.41</loc:longitude></loc:pointCoordinates>
      <lse:kilometerPoint>3.5</lse:kilometerPoint>
      <lse:province>CORUÑA, A</lse:province>
    </ns2:pointLocation>
    <fse:deviceUrl>https://etraffic.dgt.es/camarasEtraffic/176130.jpg</fse:deviceUrl>
  </ns2:device>
  <ns2:device id="9"><ns2:typeOfDevice>variableMessageSign</ns2:typeOfDevice></ns2:device>
</d2:payload>""".encode()


def test_vigo_listing_maps_to_built_in_camera_ids():
    cameras = load_vigo(json.dumps(VIGO).encode(), "https://cams.test/cam.php?id={id}")
    assert [(c.id, c.input, c.name) for c in cameras] == [
        ("05", "05", "Castelao - Grove"),
        ("24", "24", "Policarpo Sanz - Reconquista"),
    ]
    assert cameras[0].preview_url == "https://cams.test/cam.php?id=05"


def test_madrid_listing_uses_direct_jpeg_without_cache_buster():
    [camera] = load_madrid(MADRID, "")
    assert camera.id == "madrid-06303"
    assert camera.name == "Plaza de Castilla (Norte)"
    assert camera.input == "https://informo.madrid.es/cameras/Camara06303.jpg"
    assert (camera.lat, camera.lon) == (40.466063829633, -3.68894207537291)


def test_malaga_listing_uses_street_description_as_name():
    [camera] = load_malaga(json.dumps(MALAGA).encode(), "")
    assert camera.id == "malaga-21611"
    assert camera.name == "C/ José Calderón - El Boni"
    assert camera.input.endswith("/TV-87.jpg")
    assert (camera.lat, camera.lon) == (36.72406291, -4.539063)


def test_dgt_listing_names_road_direction_and_province():
    [camera] = load_dgt(DGT, "")
    assert camera.id == "dgt-176130"
    assert camera.name == "AP-9 km 3.5 → Santiago de Compostela · A Coruña"
    assert camera.input == "https://etraffic.dgt.es/camarasEtraffic/176130.jpg"
    assert (camera.lat, camera.lon) == (43.31, -8.41)


def test_lists_supported_cities(client):
    body = client.get("/api/catalog/cities").json()
    assert [city["id"] for city in body] == [city.id for city in CITIES]
    assert {"name", "country", "lat", "lon", "provider", "scope"} <= body[0].keys()
    assert [city["scope"] for city in body].count("country") == 1


@respx.mock
def test_city_cameras_are_loaded_once_and_cached(client):
    route = respx.get(VIGO_URL).respond(200, json=VIGO)
    images = respx.get(url__regex=VIGO_IMAGES).respond(200, content=JPEG)
    first = client.get("/api/catalog/cities/vigo/cameras")
    assert first.status_code == 200
    body = first.json()
    assert body["city"]["name"] == "Vigo"
    assert body["cameras"][0] == {
        "id": "05", "name": "Castelao - Grove", "lat": 42.21836, "lon": -8.74407,
        "input": "05", "previewUrl": "https://cams.test/cam.php?id=05",
    }
    assert client.get("/api/catalog/cities/vigo/cameras").json() == body
    assert route.call_count == 1
    assert images.call_count == 2  # both sample cameras checked once, then cached


@respx.mock
def test_city_whose_images_this_server_cannot_fetch_is_logged_but_still_listed(client, caplog):
    respx.get(VIGO_URL).respond(200, json=VIGO)
    respx.get(url__regex=VIGO_IMAGES).mock(side_effect=httpx.ConnectTimeout("blocked"))
    with caplog.at_level("WARNING", logger="app.catalog"):
        body = client.get("/api/catalog/cities/vigo/cameras").json()
    assert len(body["cameras"]) == 2
    assert "camera images for vigo can't be fetched from this server" in caplog.text


@pytest.mark.asyncio
@respx.mock
async def test_one_working_sample_is_enough():
    respx.get(VIGO_URL).respond(200, json=VIGO)
    respx.get("https://cams.test/cam.php?id=05").respond(404)
    respx.get("https://cams.test/cam.php?id=24").respond(200, content=JPEG)
    async with httpx.AsyncClient() as http:
        catalog = CameraCatalog(http, "https://cams.test/cam.php?id={id}")
        assert (await catalog.listing("vigo")).reachable is True


def test_unknown_city_is_404(client):
    assert client.get("/api/catalog/cities/atlantis/cameras").status_code == 404


@respx.mock
def test_unreachable_listing_is_502(client):
    respx.get(VIGO_URL).mock(side_effect=httpx.ConnectError("down"))
    response = client.get("/api/catalog/cities/vigo/cameras")
    assert response.status_code == 502
    assert "Vigo" in response.json()["detail"]


@pytest.mark.asyncio
@respx.mock
async def test_stale_listing_is_served_when_refresh_fails():
    now = [0.0]
    route = respx.get(VIGO_URL).respond(200, json=VIGO)
    respx.get(url__regex=r"https://cams\.test/.*").respond(200, content=JPEG)
    async with httpx.AsyncClient() as http:
        catalog = CameraCatalog(http, "https://cams.test/{id}.jpg", clock=lambda: now[0])
        fresh = await catalog.cameras("vigo")
        now[0] = 10 * 24 * 3600
        route.respond(500)
        assert await catalog.cameras("vigo") == fresh
        catalog._cache.clear()
        with pytest.raises(CatalogError):
            await catalog.cameras("vigo")
