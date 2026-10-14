# Design

## Context

See proposal.md for motivation and specs/ for the behaviour contract. This section records only what shapes the approach.

**Repository today** — greenfield. Only config exists: `.env.example` (Postgres vars, `API_PORT=4000`, `CORS_ORIGIN=http://localhost:5173`), `.gitignore`, `.dockerignore` (excludes `apps/web/src` and `apps/web/public`, implying an `apps/web` layout but breaking a web image build), and `.claude/launch.json` (expects `npm run dev` at the repo root serving port 5173).

**Camera source (observed 2026-10-14)**:
- `GET https://camaras.vigo.org/webcam/cam.php?id=<id>` returns the raw JPEG directly (no HTML page), 384×216 px, ~15–20 KB, no `Content-Type` header.
- Responses carry `Last-Modified`; `If-Modified-Since` yields `304 Not Modified`. Observed update cadence is roughly 30–60 s.
- Ids are zero-padded strings: `id=04` returns an image, `id=4` returns `200` with an **empty body**. Unknown ids (`999`, `abc`) also return `200` + empty body — status code alone cannot validate a camera.
- Every frame has a burned-in banner in the top-left (`TV47 G. Barbón - S. Avendaño 2026-10-14 09:17:51`), so pixel hashes always differ between frames.
- Curb parking is unmarked; cameras are PTZ and rotate between viewpoints (cam 04 looks down a street with a crossing, cam 47 along a long avenue with parking on both curbs).
- The traffic index page (`hoxe.vigo.org/conecenos/trafico.php`) contains no static `cam.php?id=` references; the catalogue is not scraped (out of scope).

**User decisions**: zones are loose curb lines, not exact bays; notifications are in-app + browser Notification API; analysis runs only while a camera is watched; persistence is SQLite.

## Goals / Non-Goals

**Goals:**
- One `docker compose up` brings up the whole stack; `npm run dev` at the root runs the web app for local development (matches `launch.json`).
- Replicate spend scales with *watched cameras × source updates*, never with clients or poll frequency.
- Detection back-end is swappable (model id via env, plus a fake detector for development and tests).
- The UI never draws overlays computed for a different frame than the one shown.

**Non-Goals:**
- Exact bay-level accuracy, licence plates, or tracking individual vehicles across frames.
- Horizontal scaling of the API (single process owns all monitors).
- Protecting zone edits from other users (no auth by requirement — see Risks).

## Decisions

### D1. Monorepo layout and tooling
```
apps/web/   Vite + React 18 + TypeScript + Tailwind + Framer Motion + Zustand
apps/api/   Python 3.12 + FastAPI + uvicorn, deps managed with uv (pyproject.toml + uv.lock)
docker-compose.yml, apps/*/Dockerfile, root package.json (npm workspaces: apps/web)
```
Root `package.json` scripts: `dev` → web dev server (5173, proxies `/api` and `/ws` to `localhost:4000`), `dev:api` → uvicorn with reload. Compose services: `api` (port `${API_PORT:-4000}`, volume `api-data:/data`) and `web` (multi-stage: build with Node, serve with nginx, reverse-proxy `/api` and `/ws` to `api`, so the browser uses one origin). `.dockerignore` is rewritten per app context.
*Alternatives*: Turborepo/Nx — unnecessary for two apps in two languages; Poetry — uv is faster and simpler in Docker.

### D2. Real-time transport: one WebSocket per client + HTTP for images
`/ws` carries small JSON messages; images are fetched over HTTP at immutable, frame-addressed URLs (`/api/cameras/{camId}/frames/{frameId}.jpg`, `Cache-Control: immutable`).

Client → server: `{"type":"subscribe","cameras":["47","04"]}` (full set, idempotent; sent on connect and on every list change).
Server → client:
- `frame` `{cameraId, frameId, capturedAt, url}` — sent as soon as a new image is stored (before analysis).
- `analysis` `{cameraId, frameId, status, viewId|null, viewConfidence, vehicles[], zones[{zoneId, name, occupied[], available[{polygon, spaces}]}], totalAvailable|null}` — `status ∈ ok | unknown_view | low_quality | analysis_unavailable | analysis_disabled`.
- `camera_status` `{cameraId, online, lastError?}`.
- On subscribe the server replays the latest `frame` + `analysis` for each camera so cards render immediately.

Geometry is normalised `[0,1]` in frame coordinates; the UI renders an SVG `viewBox="0 0 1 1" preserveAspectRatio="none"` stacked on the `<img>`, which keeps alignment at any size.
*Alternatives*: SSE — needs a second channel for changing subscriptions; base64 images in the socket — bloats messages and defeats browser caching.

### D3. Watch manager and per-camera monitor
An in-process `WatchManager` keeps `cameraId → set[connection]`. First subscriber starts a `CameraMonitor` asyncio task; last unsubscribe cancels it. Each monitor:
1. Polls with `httpx.AsyncClient` every `POLL_INTERVAL_SECONDS` (default 5) sending `If-Modified-Since`.
2. On `200`: validate non-empty body starting with JPEG SOI (`FF D8`); otherwise count as failure. Fallback dedupe by SHA-256 when `Last-Modified` is absent.
3. Persists the frame, broadcasts `frame`, and puts it into a **latest-wins slot** (size 1) consumed by the monitor's analysis worker, giving "one in-flight analysis, skip intermediates" for free.
4. Failures: exponential backoff (5 s → 60 s cap), `camera_status: offline` after 3 consecutive failures.

A process-wide semaphore (`MAX_CONCURRENT_PREDICTIONS`, default 4) bounds Replicate concurrency. Camera probing for the "add camera" flow (`GET /api/cameras/{id}/probe`) uses the same fetch/validate code and returns a preview frame.
*Alternative*: a job queue (Redis/RQ/Celery) — overkill for single-process, watch-driven load.

### D4. Analysis pipeline order
`quality check → view match → (vehicle detection) → zone assignment → gap computation → smoothing`.
- **Quality**: on the frame with the banner masked, a *directional* sharpness score (the weaker of horizontal/vertical gradient energy, divided by intensity variance) and mean luminance against configurable thresholds → `low_quality`, no prediction (saves cost on mid-rotation frames). A plain Laplacian variance was tried first but barely reacts to one-axis pan blur; the normalised directional score separates sharp frames (≈2.5–7) from motion/strong blur (< 1) and is unaffected by night darkening.
- **View match before detection**: if no views exist or no match, detection still runs (UI shows vehicles, spec requires it) but zone steps are skipped and `totalAvailable = null`.
- **Banner mask**: rectangle `VIEW_MASK=0,0,1,0.09` (normalised) applied to matching and quality checks; configurable because other cameras may place it differently.

### D5. View recognition: ORB features + RANSAC homography, with exemplars
Each view stores up to 5 **exemplar** images (the user-saved reference plus automatically added high-confidence matches that differ in brightness, so day/night/rain are covered). Each auto exemplar stores the homography from the reference to itself, so zones (always kept in reference coordinates) can be mapped through any exemplar. Re-capturing a view's reference re-aligns its zones with the old→new homography when the images match, and drops the auto exemplars (they are re-learned). Matching a frame:
1. Grayscale, mask banner, upscale ×2 (more keypoints from 384×216), CLAHE for lighting normalisation.
2. ORB (≈1500 features) → BFMatcher Hamming + Lowe ratio test against each exemplar of each view of this camera.
3. `cv2.findHomography(RANSAC)`; accept when inliers ≥ `VIEW_MIN_INLIERS` (default 25) and inlier ratio ≥ threshold, and the homography is "near-rigid" (scale 0.8–1.25, small shear/perspective terms). Confidence = normalised inlier score; best view wins.
4. The homography maps the view's zone geometry into the current frame (drift compensation, spec "Compensate small viewpoint drift").

Exemplar features are cached in memory per view (recomputed on startup), so matching costs a few ms per frame.
*Alternatives*: perceptual hash (cheap, but no drift transform and fragile to lighting/traffic); CLIP/DINO embeddings via Replicate (extra cost and latency per frame, still no geometric transform); camera-provided PTZ preset ids (not exposed by the source).

### D6. Vehicle detection via Replicate behind an adapter
`Detector` protocol: `async detect(jpeg: bytes) -> list[Detection(cls, conf, box_norm)]`. Implementations:
- `ReplicateDetector` — model ref from `REPLICATE_MODEL` (`owner/name:version`), input built from `REPLICATE_INPUT_TEMPLATE` (JSON with `{image}` placeholder, e.g. prompt `"car . van . truck . bus . motorcycle"` for open-vocabulary detectors) and an output parser selected by `REPLICATE_OUTPUT_FORMAT` (supports the common box/label/score shapes). The image is upscaled ×3 (Lanczos) before upload as a data URI — small distant cars at 384×216 are otherwise missed — and boxes larger than 20 % of the frame are discarded. Calls use the official `replicate` Python client with a timeout. Rate limits: a short `Retry-After` (≤ 20 s, e.g. the burst-1 throttle of low-credit accounts when two cameras update together) is waited out and the prediction retried once; longer windows fail fast with `analysis_unavailable` until they pass. The analyzer caches the last detections per camera, so re-analysing the same frame after a view/zone edit costs no prediction.
- `FakeDetector` — deterministic boxes from a fixture file; selected with `DETECTOR=fake`, also used automatically in tests.
- Missing `REPLICATE_API_TOKEN` with `DETECTOR=replicate` → `analysis_disabled` status (images still stream).

The default model is chosen by a short benchmark task (tasks §4.1) on frames captured from cameras 04, 34 and 47 comparing an open-vocabulary detector (Grounding DINO family) and a YOLO-family detector on recall of parked cars, false positives, latency and cost per prediction. Configuration keeps the choice reversible.
*Alternative*: a vision-language model asked to return free/occupied boxes — rejected for inconsistency between frames and higher cost; local YOLO inference — rejected by the "use Replicate" requirement.

### D7. Zone geometry and gap computation
A zone (stored in the **view's reference coordinates**, normalised) = polyline `points[]` + band half-widths `bandNear`, `bandFar` (at first/last point, linearly interpolated by arc length, modelling perspective) + optional `minGapCars` override.

Per frame (after warping zone geometry with the view homography):
1. **Ground point** of each vehicle = bottom-centre of its box (lifted by 5 % of box height to tolerate box padding).
2. **Assignment**: vehicle belongs to the zone whose band contains the ground point at the nearest arc position; ties → nearest line.
3. **Occupied interval**: project the box's bottom edge and lower-half side midpoints onto the polyline (arc-length parameter `s`); interval = `[min s, max s]`, padded by a small margin.
4. **Local car length `L(s)`**: per zone, a linear fit of interval length vs `s` from recent assigned vehicles (rolling window persisted per zone); before ≥ 3 samples, fall back to `L(s) = 2.2 × 2·band(s)` (band ≈ car width).
5. **Gaps**: complement of the union of occupied intervals on `[0, S]`. Convert each gap to car units `u = ∫ ds / L(s)` (numerical); `spaces = floor(u / 1.15)` (15 % manoeuvre margin, overridable via `minGapCars`). Report gaps with `spaces ≥ 1`.
6. **Polygons**: available gap → polygon formed by offsetting the polyline sub-segment by ±band(s) (rendered green); occupied vehicles → their boxes (rendered red); unassigned vehicles → sent with `zoneId: null` and drawn as faint outlines (toggle).

### D8. Temporal smoothing (hysteresis)
Each zone's arc is discretised into 200 bins. A bin is published as available only if it was free in the last `AVAILABLE_CONFIRM_FRAMES` (default 2) consecutive analysed frames **of the same view**; occupancy is published immediately. History is kept per zone (each zone belongs to one view), so frames of *other* views, unknown views or low-quality frames in between do not break the streak — the live check showed Vigo cameras switching viewpoint every one or two images, and resetting on every rotation meant a space was almost never confirmed. History expires when a view has not been seen for 5 minutes, and restarts when the zone is edited. With a ~70 s source cadence this delays "available" by one update of that view — accepted to avoid false alerts.

### D9. Persistence: SQLite + frames on disk
`/data/parking.db` (plain `sqlite3` via a small repository module run in a thread pool; schema versioned with a `schema_version` table and ordered SQL migrations). Tables: `views(id, camera_id, name, created_at)`, `view_exemplars(id, view_id, frame_path, is_reference, brightness, ref_homography)`, `zones(id, view_id, name, points_json, band_near, band_far, min_gap_cars, updated_at)`, `zone_length_samples(zone_id, s, length, observed_at)` (capped per zone). Frames: `/data/frames/{cameraId}/{frameId}.jpg`, `frameId = <lastModifiedEpoch>-<hash8>`; pruning keeps the newest `FRAME_RETENTION` (20). Exemplar images are copied to `/data/exemplars/{viewId}/`, so pruning can never remove a view's reference. The camera *list* is never stored server-side (it lives in each browser's `localStorage`).
*Alternative*: Postgres (as in current `.env.example`) — an extra service for a few small tables; dropped per user decision.

REST surface (all JSON unless noted): `GET /api/health`; `GET /api/cameras/probe?input=<url or id>` and `GET /api/cameras/{id}/probe`; `GET /api/cameras/{id}/frames/{frameId}.jpg`; `GET|POST /api/cameras/{id}/views`; `PATCH|DELETE /api/views/{viewId}`; `POST /api/views/{viewId}/reference` (re-capture from a `frameId`); `GET /api/views/{viewId}/reference.jpg`; `GET|POST /api/views/{viewId}/zones`; `PATCH|DELETE /api/zones/{zoneId}`. Camera ids validated as `^\d{1,3}$` and normalised by zero-padding to two digits; zone payloads capped (≤ 64 points, coordinates in `[0,1]`).

### D10. Frontend state and rendering
Zustand stores:
- `useCameraStore` (persisted via `persist` middleware, key `parking-vision:v1`, `version` + `migrate`, a `createJSONStorage` wrapper that catches storage errors and flags `storageAvailable=false`): ordered `cameras[{id, label, notify}]`, `settings{sound}`.
- `useLiveStore` (memory only): per camera `{frame, analysis, displayedFrameId, status, lastFrameAt}`.
- A `wsClient` module owns the socket, reconnects with jittered backoff, re-sends `subscribe` whenever `cameras` changes (store subscription).

Rendering: the card preloads the next frame (`new Image()` + `decode()`), then crossfades (`AnimatePresence`, keyed by `frameId`). Overlays render only when `analysis.frameId === displayedFrameId`; otherwise the previous overlay fades to 30 % with an "analysing" shimmer. Framer Motion: `layout` on the card grid, `layoutId` shared-element transition into the focus view, spring-animated counters, staggered rectangle entrance; `useReducedMotion` disables movement. Tailwind with CSS-variable tokens for light/dark. Zone editor: SVG over the view reference image, click-to-add points, draggable handles, band-width sliders with live band preview.

### D11. Notifications computed client-side
Availability transitions are detected in `useLiveStore` when an `analysis` with `status = ok` arrives: alert if `totalAvailable` goes `0 → ≥1` or a zone gains its first available gap, subject to a per-camera cooldown (`2 min`, bypassed when the count increases further). Delivery: animated toast (always) + `new Notification(...)` when `document.visibilityState === 'hidden'` and permission is granted; permission requested from the notification toggle's click handler. Client-side because preferences live in `localStorage` and no background delivery is in scope.

## Risks / Trade-offs

- **Small, distant vehicles at 384×216 are hard to detect** → upscale before inference, benchmark models (tasks §4.1), per-zone confidence threshold, hysteresis; document that far-end curbs are less reliable.
- **Unauthenticated zone editing**: anyone reaching the API can change shared zones → intended for self-hosting/LAN; CORS restricted to `CORS_ORIGIN`; payload validation and size caps. Adding an edit guard later would be a spec change (spec requires no authentication).
- **Night/rain breaks feature matching** → CLAHE, multiple brightness-diverse exemplars per view, and "unknown view" is the safe failure (no false availability).
- **Replicate cost/latency** → analysis only for watched cameras and new images, skip low-quality frames, latest-wins slot, global concurrency cap; `analysis_unavailable` on failures without retry storms.
- **Replicate cold starts** (tens of seconds on unpopular models) → the image is shown immediately with "analysing"; prefer a model with warm/official deployment in the benchmark.
- **Source changes format or blocks scraping** → fetch/validate isolated in one module; descriptive `User-Agent`; conservative 5 s conditional polling (mostly `304`, a few hundred bytes).
- **Heuristic car-length model** (band-derived fallback) can miscount spaces → the count is labelled "≈", and per-zone `minGapCars` override exists.
- **Single-process state** (watch manager, smoothing history) is lost on restart → acceptable; clients reconnect and history rebuilds within two frames.

## Migration Plan

Greenfield — no data migration. Rollout: `cp .env.example .env`, set `REPLICATE_API_TOKEN`, `docker compose up --build`. Rollback: `docker compose down` (the `api-data` volume keeps views/zones). `.env.example` loses the Postgres variables; nothing consumes them today.

## Open Questions

- Which Replicate model becomes the default — resolved by the benchmark task; the choice is configuration only.
- Exact banner mask rectangle for cameras other than 04/34/47 — default covers observed cameras; tunable via env.
