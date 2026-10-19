import httpx
import pytest
import respx

from app.source import FetchError, SourceFetcher

URL = "https://cams.test/cam.php?id={id}"
JPEG = b"\xff\xd8\xff\xe0" + b"x" * 100
LM = "Wed, 14 Oct 2026 07:17:51 GMT"


@pytest.fixture
async def fetcher():
    async with httpx.AsyncClient() as client:
        yield SourceFetcher(client, URL, timeout=1.0)


@respx.mock
async def test_new_image(fetcher):
    route = respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    res = await fetcher.fetch("47")
    assert res.changed and res.data == JPEG and res.last_modified == LM
    assert res.captured_epoch == 1791962271
    assert route.calls.last.request.headers["user-agent"].startswith("FreePark/")
    assert "if-modified-since" not in route.calls.last.request.headers


@respx.mock
async def test_conditional_304(fetcher):
    route = respx.get("https://cams.test/cam.php?id=47").respond(304)
    res = await fetcher.fetch("47", last_modified=LM)
    assert not res.changed
    assert route.calls.last.request.headers["if-modified-since"] == LM


@respx.mock
async def test_empty_body_is_failure(fetcher):
    respx.get("https://cams.test/cam.php?id=4").respond(200, content=b"")
    with pytest.raises(FetchError, match="empty"):
        await fetcher.fetch("4")


@respx.mock
async def test_non_jpeg_is_failure(fetcher):
    respx.get("https://cams.test/cam.php?id=47").respond(200, content=b"<html>oops</html>")
    with pytest.raises(FetchError):
        await fetcher.fetch("47")


@respx.mock
async def test_server_error(fetcher):
    respx.get("https://cams.test/cam.php?id=47").respond(503)
    with pytest.raises(FetchError, match="503"):
        await fetcher.fetch("47")


@respx.mock
async def test_timeout(fetcher):
    respx.get("https://cams.test/cam.php?id=47").mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(FetchError, match="ReadTimeout"):
        await fetcher.fetch("47")


@respx.mock
async def test_sha_dedupe_without_last_modified(fetcher):
    respx.get("https://cams.test/cam.php?id=47").respond(200, content=JPEG)
    first = await fetcher.fetch("47")
    assert first.changed and first.last_modified is None
    second = await fetcher.fetch("47", last_sha256=first.sha256)
    assert not second.changed


@respx.mock
async def test_same_last_modified_on_200_is_unchanged(fetcher):
    respx.get("https://cams.test/cam.php?id=47").respond(
        200, content=JPEG, headers={"Last-Modified": LM}
    )
    res = await fetcher.fetch("47", last_modified=LM)
    assert not res.changed
