"""Capture camera frames from camaras.vigo.org into tests/fixtures/frames/.

Usage: uv run python scripts/capture_frames.py --cameras 04 34 47 --per-camera 10

Only images whose Last-Modified changed are saved, named <camera>_<epoch>.jpg.
"""

from __future__ import annotations

import argparse
import time
from email.utils import parsedate_to_datetime
from pathlib import Path

import httpx

SOURCE = "https://camaras.vigo.org/webcam/cam.php?id={id}"
OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "frames"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cameras", nargs="+", default=["04", "34", "47"])
    parser.add_argument("--per-camera", type=int, default=10)
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--max-minutes", type=float, default=20.0)
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    last: dict[str, str] = {}
    saved = {c: 0 for c in args.cameras}
    deadline = time.monotonic() + args.max_minutes * 60
    headers = {"User-Agent": "parking-vision/0.1 (fixture capture)"}
    with httpx.Client(timeout=10, headers=headers) as client:
        while time.monotonic() < deadline and any(n < args.per_camera for n in saved.values()):
            for cam in args.cameras:
                if saved[cam] >= args.per_camera:
                    continue
                req_headers = {"If-Modified-Since": last[cam]} if cam in last else {}
                try:
                    resp = client.get(SOURCE.format(id=cam), headers=req_headers)
                except httpx.HTTPError as exc:
                    print(f"{cam}: {exc}")
                    continue
                if resp.status_code != 200 or not resp.content.startswith(b"\xff\xd8"):
                    continue
                lm = resp.headers.get("last-modified")
                if lm is None:
                    continue
                last[cam] = lm
                epoch = int(parsedate_to_datetime(lm).timestamp())
                path = OUT / f"{cam}_{epoch}.jpg"
                if not path.exists():
                    path.write_bytes(resp.content)
                    saved[cam] += 1
                    print(f"saved {path.name}", flush=True)
            time.sleep(args.interval)
    print("done", saved)


if __name__ == "__main__":
    main()
