"""Compare Replicate vehicle detectors on captured fixture frames.

Usage (needs REPLICATE_API_TOKEN):
    uv run python scripts/benchmark_models.py --frames 04_1.jpg 47_2.jpg --out /tmp/bench

Writes `results.json` (detections, latency per run) and one annotated contact
sheet per frame (`<frame>.png`, a row per model/upscale config) for review.
Predictions are spaced by --spacing seconds to respect Replicate rate limits.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.detection import ReplicateDetector, replicate_runner  # noqa: E402

FRAMES = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "frames"

CANDIDATES = {
    "grounding-dino": dict(
        model="adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa",
        template='{"image": "{image}", "query": "car . van . truck . bus . motorcycle",'
        ' "box_threshold": 0.25, "text_threshold": 0.25, "show_visualisation": false}',
        output_format="grounding_dino",
    ),
    "yolo-world-xl": dict(
        model="franz-biz/yolo-world-xl:fd1305d3fc19e81540542f51c2530cf8f393e28cc6ff4976337c3e2b75c7c292",
        template='{"input_media": "{image}", "class_names": "car, van, truck, bus, motorcycle",'
        ' "score_thr": 0.05, "return_json": true, "max_num_boxes": 100}',
        output_format="yolo",
    ),
}


def annotate(img: np.ndarray, dets, label: str) -> np.ndarray:
    out = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    h, w = out.shape[:2]
    for d in dets:
        x1, y1, x2, y2 = d["box"]
        cv2.rectangle(out, (int(x1 * w), int(y1 * h)), (int(x2 * w), int(y2 * h)), (0, 0, 255), 1)
    cv2.putText(
        out, f"{label} n={len(dets)}", (8, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
    )
    return out


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", nargs="+", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--upscales", nargs="+", type=float, default=[2.0, 3.0])
    parser.add_argument("--min-conf", type=float, default=0.25)
    parser.add_argument("--spacing", type=float, default=11.0)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    runner = replicate_runner(os.environ["REPLICATE_API_TOKEN"])

    results = []
    for name in args.frames:
        jpeg = (FRAMES / name).read_bytes()
        img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        rows = []
        for cand, cfg in CANDIDATES.items():
            for up in args.upscales:
                det = ReplicateDetector(
                    runner,
                    cfg["model"],
                    cfg["template"],
                    cfg["output_format"],
                    upscale=up,
                    min_confidence=args.min_conf,
                )
                start = time.monotonic()
                try:
                    dets = [d.__dict__ for d in await det.detect(jpeg)]
                    error = None
                except Exception as exc:  # recorded, benchmark continues
                    dets, error = [], str(exc)
                latency = time.monotonic() - start
                results.append(
                    dict(
                        frame=name,
                        model=cand,
                        upscale=up,
                        latency=latency,
                        error=error,
                        detections=dets,
                    )
                )
                print(
                    f"{name} {cand} x{up}: {len(dets)} dets {latency:.1f}s {error or ''}",
                    flush=True,
                )
                rows.append(annotate(img, dets, f"{cand} x{up}"))
                await asyncio.sleep(args.spacing)
        cv2.imwrite(str(args.out / f"{Path(name).stem}.png"), np.vstack(rows))
    (args.out / "results.json").write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    asyncio.run(main())
