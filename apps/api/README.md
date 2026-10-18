# Parking Vision API

FastAPI service that watches Vigo traffic cameras (`https://camaras.vigo.org/webcam/cam.php?id=NN`)
while at least one client subscribes to them, detects new images, works out which stored
viewpoint each frame shows, detects vehicles through Replicate and computes free curb space.

```bash
uv sync
uv run uvicorn app.main:app --reload --port 4000   # or `npm run dev:api` from the repo root
uv run pytest -q
uv run ruff check .
```

Data (SQLite `parking.db`, frames, view exemplars) lives in `DATA_DIR` (default `./data`,
`/data` in Docker).

## Configuration

Every setting is an environment variable (also read from `.env`). See `../../.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `API_PORT` | `4000` | Port used by `npm run dev:api` / Docker |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed browser origins |
| `DATA_DIR` | `./data` | SQLite database, frames and exemplar images |
| `POLL_INTERVAL_SECONDS` | `5` | Conditional poll interval per watched camera |
| `FRAME_RETENTION` | `20` | Frames kept per camera (exemplars are stored separately) |
| `DETECTOR` | `replicate` | `replicate` or `fake` (deterministic boxes, no token needed) |
| `REPLICATE_MODEL` | Grounding DINO (pinned version) | `owner/name:version` |
| `REPLICATE_INPUT_TEMPLATE` | `{"image": "{image}", "query": "car", …}` | JSON input; `"{image}"` becomes a data URI |
| `REPLICATE_OUTPUT_FORMAT` | `grounding_dino` | Output parser: `grounding_dino` or `yolo` |
| `DETECTION_UPSCALE` | `3` | Frame upscaling before inference |
| `DETECTION_MIN_CONFIDENCE` | `0.15` | Detections below are dropped |
| `DETECTION_MAX_BOX_AREA` | `0.2` | Boxes larger than this fraction of the frame are dropped |
| `MAX_CONCURRENT_PREDICTIONS` | `4` | Global cap on in-flight Replicate predictions |
| `FAKE_DETECTIONS_FILE` | – | JSON fixture for `DETECTOR=fake` (`{"<sha256 prefix>|*": [{cls, conf, box}]}`) |
| `VIEW_MASK` | `0,0,1,0.09` | Burned-in banner rectangle ignored for matching/quality (`x,y,w,h`) |
| `VIEW_MIN_INLIERS` | `25` | Minimum RANSAC inliers to accept a view match |
| `BLUR_THRESHOLD` / `DARK_THRESHOLD` | `1.0` / `25` | Frame quality limits |
| `AVAILABLE_CONFIRM_FRAMES` | `2` | Consecutive free frames before a stretch is reported available |
| `GAP_MARGIN` | `1.15` | Car lengths required per space (zone `minGapCars` overrides) |

The model choice is documented in [docs/model-benchmark.md](docs/model-benchmark.md).

## Coordinates

All geometry is normalised to the frame: `x` and `y` in `[0, 1]`, origin top-left. Boxes are
`[x1, y1, x2, y2]`; polygons are `[[x, y], …]`. Zone band widths (`bandNear`, `bandFar`) are
half-widths as a fraction of the image **width**, at the end of the line nearer the camera
(lower in the image) and the end further away, whichever direction it was drawn in.

## REST

| Method & path | Body | Response |
|---|---|---|
| `GET /api/health` | – | `{"status": "ok"}` |
| `GET /api/cameras/probe?input=<url or id>` | – | `200 {cameraId, frameId, capturedAt, url}`; `400` bad input; `502` camera unreachable / empty image |
| `GET /api/cameras/{id}/probe` | – | same as above for a bare id (`4` → `04`) |
| `GET /api/cameras/{id}/frames/{frameId}.jpg` | – | JPEG, `Cache-Control: immutable`; `404` when pruned |
| `POST /api/cameras/{id}/reanalyze?fresh=` | `Replicate-Api-Key` header (optional) | Re-runs analysis of the camera's latest image using the caller's key. Watched camera with the same key: `202 {queued: true}`, result follows over the WebSocket; `fresh=true` forces a new prediction. An unwatched camera is analysed right away without retaining per-user state: `200 {queued: false, analysis}` (a new prediction). `502` if no image can be obtained |
| `GET /api/cameras/{id}/views` | – | `[View]` |
| `POST /api/cameras/{id}/views` | `{frameId, name}` | `201 View` — saves that frame as the view's reference |
| `PATCH /api/views/{viewId}` | `{name}` | `View` |
| `DELETE /api/views/{viewId}` | – | `204`; deletes its zones and exemplars |
| `POST /api/views/{viewId}/reference` | `{frameId}` | `View & {zonesRealigned: bool}` — zones are carried over when the new image matches the old one |
| `GET /api/views/{viewId}/reference.jpg` | – | reference JPEG |
| `GET /api/views/{viewId}/zones` | – | `[Zone]` |
| `POST /api/views/{viewId}/zones` | `{name, points, bandNear, bandFar, minGapCars?}` | `201 Zone`; `422` if < 2 or > 64 points, coords outside `[0,1]`, band ≤ 0 |
| `PATCH /api/zones/{zoneId}` | any subset; `minGapCars: null` clears the override | `Zone` |
| `DELETE /api/zones/{zoneId}` | – | `204` |

`View = {id, cameraId, name, createdAt, referenceUrl, exemplarCount, zoneCount}`
`Zone = {id, viewId, name, points, bandNear, bandFar, minGapCars, updatedAt}`

Creating, editing or deleting views and zones re-analyses the camera's latest frame (reusing its
detections, so no extra prediction).

## WebSocket `/ws`

Client → server (send the full set on connect and whenever it changes; ids are normalised,
invalid ones ignored, at most 24):

```json
{"type": "subscribe", "cameras": ["47", "04"], "replicateApiKey": "your-key"}
```

Server → client:

```jsonc
{"type": "subscribed", "cameras": ["04", "47"]}

// a new image was stored (sent before analysis)
{"type": "frame", "cameraId": "47", "frameId": "1791963398-3fa1c2d4",
 "capturedAt": "2026-10-14T07:36:38+00:00", "url": "/api/cameras/47/frames/1791963398-3fa1c2d4.jpg"}

// analysis of that frame
{"type": "analysis", "cameraId": "47", "frameId": "1791963398-3fa1c2d4",
 "capturedAt": "…", "analysedAt": "…",
 "status": "ok",                 // ok | unknown_view | low_quality | analysis_unavailable | analysis_disabled
 "viewId": 3, "viewName": "Avenue north", "viewConfidence": 0.87,
 "vehicles": [{"box": [0.66, 0.8, 0.78, 0.97], "cls": "car", "conf": 0.62, "zoneId": 5}],
 "zones": [{"zoneId": 5, "name": "Right curb", "spaces": 1,
            "occupied": [{"polygon": [[0.7, 0.98], …]}],
            "available": [{"polygon": [[0.6, 0.62], …], "spaces": 1}]}],
 "totalAvailable": 1,            // null unless status is ok and the view has zones
 "reason": "rate limited",       // analysis_unavailable / analysis_disabled only
 "qualityReason": "too blurred"} // low_quality only

// source health (offline after 3 consecutive failed fetches, online again on recovery)
{"type": "camera_status", "cameraId": "04", "online": false, "lastError": "empty response"}

{"type": "error", "message": "unknown message"}
```

The key is optional: without it, frames still stream and analysis reports
`analysis_disabled` (unless `DETECTOR=fake`). It is held only in memory while the connection
is active and is never echoed in server messages. Analyses are isolated by key; connections
using different keys never receive each other's results. On subscribe, the latest
`camera_status` (if offline), `frame` and `analysis` for that key are replayed. Polling stops
when the last connection using that camera and key disconnects.
