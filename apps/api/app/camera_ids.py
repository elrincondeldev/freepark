"""Camera IDs and public JPEG source URLs.

The source publishes zero-padded ids: `cam.php?id=04` returns an image while
`cam.php?id=4` returns an empty body, so ids are padded to two digits.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
from urllib.parse import parse_qs, urlparse, urlsplit, urlunsplit

_ID_RE = re.compile(r"^\d{1,3}$")
_CUSTOM_ID_RE = re.compile(r"^c_[0-9a-f]{24}$")
_SOURCE_HOST = "camaras.vigo.org"
MAX_SOURCE_URL_LENGTH = 2048


class InvalidCameraId(ValueError):
    pass


def normalize_camera_id(raw: str) -> str:
    """Return a canonical Vigo id or an opaque id for a public JPEG URL."""
    value = raw.strip()
    if _CUSTOM_ID_RE.fullmatch(value):
        return value
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


def normalize_source_url(raw: str) -> str:
    """Accept only an unauthenticated HTTP(S) URL on a DNS hostname and standard port."""
    value = raw.strip()
    if not value or len(value) > MAX_SOURCE_URL_LENGTH or any(ord(c) < 33 for c in value):
        raise InvalidCameraId("invalid source URL")
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        port = parsed.port
        ascii_host = host.encode("idna").decode("ascii").lower() if host else ""
    except (ValueError, UnicodeError) as exc:
        raise InvalidCameraId("invalid source URL") from exc
    if parsed.scheme not in {"http", "https"} or not ascii_host:
        raise InvalidCameraId("source must be an HTTP or HTTPS URL")
    if parsed.username or parsed.password or not re.fullmatch(r"[a-z0-9.-]+", ascii_host):
        raise InvalidCameraId("source URL must use a public hostname without credentials")
    if ascii_host.startswith(".") or ascii_host.endswith(".") or ".." in ascii_host:
        raise InvalidCameraId("invalid source hostname")
    try:
        ipaddress.ip_address(ascii_host)
    except ValueError:
        pass
    else:
        raise InvalidCameraId("source URL must use a DNS hostname")
    if port not in (None, 80 if parsed.scheme == "http" else 443):
        raise InvalidCameraId("source URL must use the standard HTTP or HTTPS port")
    if ascii_host == "localhost" or ascii_host.endswith((".localhost", ".local", ".internal")):
        raise InvalidCameraId("source URL must use a public hostname")
    return urlunsplit((parsed.scheme, ascii_host, parsed.path or "/", parsed.query, ""))


def custom_camera_id(source_url: str) -> str:
    return "c_" + hashlib.sha256(source_url.encode()).hexdigest()[:24]


def parse_camera_source(raw: str) -> tuple[str, str | None]:
    """Resolve Vigo shorthand or a direct public JPEG URL."""
    try:
        return parse_camera_input(raw), None
    except InvalidCameraId:
        source_url = normalize_source_url(raw)
        return custom_camera_id(source_url), source_url
