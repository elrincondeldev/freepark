"""Fetching JPEG frames from Vigo and user-selected public camera URLs."""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import socket
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.camera_ids import InvalidCameraId, custom_camera_id, normalize_source_url

USER_AGENT = "FreePark/0.1 (+https://getfreepark.com)"
JPEG_SOI = b"\xff\xd8"
MAX_FRAME_BYTES = 5 * 1024 * 1024


class FetchError(Exception):
    """The source could not provide a valid image."""


@dataclass(frozen=True)
class Fetched:
    """A new image. `changed=False` means the source reported no update."""

    changed: bool
    data: bytes = b""
    last_modified: str | None = None
    captured_epoch: int = 0
    sha256: str = ""


UNCHANGED = Fetched(changed=False)


def _epoch(last_modified: str | None) -> int:
    if last_modified:
        try:
            return int(parsedate_to_datetime(last_modified).timestamp())
        except (TypeError, ValueError):
            pass
    return int(time.time())


class SourceFetcher:
    def __init__(
        self, client: httpx.AsyncClient, url_template: str, timeout: float,
        public_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._client = client
        self._public_client = public_client
        self._url_template = url_template
        self._timeout = timeout
        self._sources: dict[str, str] = {}

    def register_source(self, camera_id: str, source_url: str) -> None:
        self.set_sources({camera_id: source_url})

    def set_sources(self, sources: dict[str, str]) -> None:
        validated = {}
        for camera_id, source_url in sources.items():
            canonical = normalize_source_url(source_url)
            if custom_camera_id(canonical) != camera_id:
                raise InvalidCameraId("camera id does not match source URL")
            validated[camera_id] = canonical
        if len(self._sources.keys() | validated.keys()) > 64:
            raise InvalidCameraId("too many camera sources in one session")
        self._sources.update(validated)

    def url(self, camera_id: str) -> str:
        if camera_id.startswith("c_"):
            try:
                return self._sources[camera_id]
            except KeyError as exc:
                raise FetchError("camera source not registered") from exc
        return self._url_template.format(id=camera_id)

    async def fetch(
        self,
        camera_id: str,
        last_modified: str | None = None,
        last_sha256: str | None = None,
    ) -> Fetched:
        source_url = self.url(camera_id)
        headers = {"User-Agent": USER_AGENT}
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        try:
            if camera_id.startswith("c_"):
                resp, data = await self._fetch_public(source_url, headers)
            else:
                resp = await self._client.get(
                    source_url, headers=headers, timeout=self._timeout
                )
                data = resp.content
        except httpx.HTTPError as exc:
            raise FetchError(f"request failed: {exc.__class__.__name__}") from exc

        if resp.status_code == 304:
            return UNCHANGED
        if resp.status_code != 200:
            raise FetchError(f"unexpected status {resp.status_code}")
        if len(data) > MAX_FRAME_BYTES:
            raise FetchError("image exceeds 5 MB limit")
        if not data.startswith(JPEG_SOI):
            raise FetchError("empty or non-JPEG response" if data else "empty response")

        lm = resp.headers.get("last-modified")
        sha = hashlib.sha256(data).hexdigest()
        if lm is None and last_sha256 == sha:
            return UNCHANGED
        if lm is not None and lm == last_modified:
            return UNCHANGED
        return Fetched(
            changed=True, data=data, last_modified=lm, captured_epoch=_epoch(lm), sha256=sha
        )

    async def _fetch_public(
        self, source_url: str, headers: dict[str, str]
    ) -> tuple[httpx.Response, bytes]:
        if self._public_client is None:
            raise FetchError("public source fetcher unavailable")
        parsed = urlsplit(source_url)
        host = parsed.hostname or ""
        port = 443 if parsed.scheme == "https" else 80
        address = await _resolve_public_ip(host, port)
        pinned = f"[{address}]" if ":" in address else address
        pinned_url = urlunsplit((parsed.scheme, pinned, parsed.path, parsed.query, ""))
        request = self._public_client.build_request(
            "GET", pinned_url,
            headers={**headers, "Host": host, "Accept-Encoding": "identity", "Connection": "close"},
            timeout=self._timeout,
            extensions={"sni_hostname": host},
        )
        response = await self._public_client.send(request, stream=True, follow_redirects=False)
        try:
            if response.status_code != 200:
                return response, b""
            content_length = response.headers.get("content-length", "0")
            try:
                too_large = int(content_length) > MAX_FRAME_BYTES
            except ValueError as exc:
                raise FetchError("invalid image content length") from exc
            if too_large:
                raise FetchError("image exceeds 5 MB limit")
            chunks = bytearray()
            async for chunk in response.aiter_raw():
                chunks.extend(chunk)
                if len(chunks) > MAX_FRAME_BYTES:
                    raise FetchError("image exceeds 5 MB limit")
            return response, bytes(chunks)
        finally:
            await response.aclose()


async def _resolve_public_ip(host: str, port: int) -> str:
    try:
        records = await asyncio.get_running_loop().getaddrinfo(
            host, port, type=socket.SOCK_STREAM
        )
    except OSError as exc:
        raise FetchError("camera hostname could not be resolved") from exc
    addresses = [ipaddress.ip_address(record[4][0]) for record in records]
    if not addresses or any(not address.is_global for address in addresses):
        raise FetchError("camera hostname does not resolve only to public addresses")
    return str(addresses[0])
