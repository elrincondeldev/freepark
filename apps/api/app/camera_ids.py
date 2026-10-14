"""Normalisation of Vigo camera identifiers.

The source publishes zero-padded ids: `cam.php?id=04` returns an image while
`cam.php?id=4` returns an empty body, so ids are padded to two digits.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_ID_RE = re.compile(r"^\d{1,3}$")
_SOURCE_HOST = "camaras.vigo.org"


class InvalidCameraId(ValueError):
    pass


def normalize_camera_id(raw: str) -> str:
    """Return the canonical id for a bare identifier like `4`, `04` or `47`."""
    value = raw.strip()
    if not _ID_RE.match(value):
        raise InvalidCameraId(f"invalid camera id: {raw!r}")
    return value.zfill(2)


def parse_camera_input(raw: str) -> str:
    """Accept a bare id or a `https://camaras.vigo.org/webcam/cam.php?id=NN` URL."""
    value = raw.strip()
    if _ID_RE.match(value):
        return normalize_camera_id(value)
    parsed = urlparse(value if "://" in value else f"https://{value}")
    if parsed.hostname != _SOURCE_HOST or not parsed.path.endswith("/cam.php"):
        raise InvalidCameraId(f"not a Vigo camera URL: {raw!r}")
    ids = parse_qs(parsed.query).get("id")
    if not ids:
        raise InvalidCameraId(f"camera URL has no id: {raw!r}")
    return normalize_camera_id(ids[0])
