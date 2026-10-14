# Vehicle detector benchmark (task 4.1)

Run on 2026-10-14 with `scripts/benchmark_models.py` against captured fixture frames
(`tests/fixtures/frames/`, 384×216 JPEG). Recall and false positives were scored by
visually reviewing the annotated contact sheets the script writes.

## Candidates

| id | Replicate model | Output shape |
|---|---|---|
| Grounding DINO | `adirik/grounding-dino:efd10a8d…` (open-vocabulary) | `{"detections": [{bbox, label, confidence}]}` |
| YOLO-World XL | `franz-biz/yolo-world-xl:fd1305d3…` (YOLO family, open-vocabulary) | `{"json_str": "{\"Det-0\": {x0, y0, x1, y1, score, cls}}"}` |

## Results

Six frames (two per camera 04 / 34 / 47, different viewpoints), each run at ×2 and ×3
upscaling, `min_confidence` 0.25; then the dense frame `47_1791963398.jpg` (≈20 parked
vehicles: ≈11 on the left curb, ≈9 on the right) re-run with lower thresholds.

| Config | Detections per frame (6 frames) | Parked-vehicle recall on `47_1791963398` | False positives on `47_1791963398` | Median latency (wall) | Median `predict_time` |
|---|---|---|---|---|---|
| Grounding DINO, 5-class query, thr 0.25, ×2 | 7–20 | ≈40 % (8/20) — misses most of the dense left-curb row | ≈4 (kiosk, ad panel, motorbikes) | 1.5 s | 0.10 s |
| Grounding DINO, 5-class query, thr 0.25, ×3 | 7–22 | ≈45 % | ≈4 | 1.6 s | 0.10 s |
| YOLO-World XL, thr 0.25, ×2 / ×3 | 0–2 | ≈5 % | 0 | 1.2 s | 0.07 s |
| YOLO-World XL, thr 0.05, ×3 | 4 | ≈10 % | 1 | 0.9 s | 0.07 s |
| **Grounding DINO, query `car`, thr 0.15, ×3** | 47 | **≈85 % (17/20)** | ≈7, almost all on sidewalks (kiosk, tree, panels) | 1.3 s | 0.10 s |
| Grounding DINO, 5-class query, thr 0.15, ×3 | 66 | ≈85 % | ≈12 incl. very large boxes | 1.4 s | 0.10 s |

YOLO-World scores vehicles in these low-resolution frames below 0.15 almost everywhere,
so it is not usable. Upscaling ×3 vs ×2 changes little for Grounding DINO; ×3 is kept as
it slightly helps far vehicles at no measurable latency cost.

## Chosen default

```
REPLICATE_MODEL=adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa
REPLICATE_INPUT_TEMPLATE={"image": "{image}", "query": "car", "box_threshold": 0.15, "text_threshold": 0.15, "show_visualisation": false}
REPLICATE_OUTPUT_FORMAT=grounding_dino
DETECTION_UPSCALE=3
DETECTION_MIN_CONFIDENCE=0.15
DETECTION_MAX_BOX_AREA=0.2
```

High recall is preferred over precision: a missed parked car creates a false "free
space", while most false positives sit on sidewalks and fall outside the curb zone
bands, so they never count as occupying a zone. Boxes larger than 20 % of the frame
are discarded (they are scene-level false positives).

## Cost and limits

- `predict_time` ≈ 0.1 s per frame. Replicate bills per second of GPU time, so a
  prediction costs a small fraction of a cent; check the model page for the current rate.
- Accounts with less than US$5 credit are throttled to **6 predictions per minute
  (burst 1)**. The source updates each camera roughly every 70 s, so about five
  watched cameras fit under that limit; beyond it frames are reported as
  `analysis_unavailable` until the `Retry-After` window passes.
- Far-end vehicles (top ~15 % of the street) are still often missed; zones should be
  drawn on the nearer part of each curb.

## Live check (task 12.3, 2026-10-14 10:09–10:24)

Real `REPLICATE_API_TOKEN`, cameras 04, 34 and 47 watched for 15 minutes through one
WebSocket client; camera 47 had a saved view ("Avenue") with one zone.

| Camera | New images | Analyses | Statuses |
|---|---|---|---|
| 04 | 15 | 15 | 15 × `unknown_view` (no views saved) |
| 34 | 13 | 13 | 12 × `unknown_view`, 1 × `analysis_unavailable` (rate limit at start-up) |
| 47 | 15 | 15 | 8 × `ok` (Avenue, confidence 1.0, 0–6 free), 7 × `unknown_view` |

- **Predictions only for new images:** 43 new images → 42 predictions (+1 rate-limited).
  Between images every 5 s poll returned `304 Not Modified` and triggered nothing.
- **Polling stops on close:** the last request to the source was at 10:23:58; the socket
  closed at 10:24:00 and no further polls were logged.
- **Viewpoint changes:** camera 47 switched from "Avenue" to another viewpoint at 10:10:26
  (reported `unknown_view`, verified visually), came back at 10:15:21 and was recognised
  automatically for the next five images.
- **Cameras rotate often:** each camera changed viewpoint every one or two images. This led
  to keeping the "confirmed free" history per view instead of resetting it on every
  rotation (design D8).
- **Rate limit at start-up:** three cameras subscribed at once exceed the burst-1 throttle of
  low-credit accounts; short `Retry-After` windows are now waited out for up to three
  attempts instead of one.
