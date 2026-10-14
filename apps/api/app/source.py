"""Fetching camera images from the public Vigo source."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime

import httpx

USER_AGENT = "parking-vision/0.1 (+self-hosted street parking monitor)"
JPEG_SOI = b"\xff\xd8"


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
    def __init__(self, client: httpx.AsyncClient, url_template: str, timeout: float) -> None:
        self._client = client
        self._url_template = url_template
        self._timeout = timeout

    def url(self, camera_id: str) -> str:
        return self._url_template.format(id=camera_id)

    async def fetch(
        self,
        camera_id: str,
        last_modified: str | None = None,
        last_sha256: str | None = None,
    ) -> Fetched:
        headers = {"User-Agent": USER_AGENT}
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        try:
            resp = await self._client.get(
                self.url(camera_id), headers=headers, timeout=self._timeout
            )
        except httpx.HTTPError as exc:
            raise FetchError(f"request failed: {exc.__class__.__name__}") from exc

        if resp.status_code == 304:
            return UNCHANGED
        if resp.status_code != 200:
            raise FetchError(f"unexpected status {resp.status_code}")
        data = resp.content
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
