# Tasks

## 1. Monorepo scaffolding

- [x] 1.1 Create root `package.json` (npm workspaces with `apps/web`; scripts `dev`, `dev:api`, `build`, `test`, `lint`) and verify `npm install` succeeds at the root
- [x] 1.2 Scaffold `apps/web` with Vite + React 18 + TypeScript (strict), Tailwind, Framer Motion, Zustand, Vitest + Testing Library, ESLint; configure the dev server on 5173 proxying `/api` and `/ws` to `http://localhost:4000`; verify `npm run dev` serves a placeholder page on 5173 (as `.claude/launch.json` expects) and `npm test -w apps/web` runs
- [x] 1.3 Scaffold `apps/api` with uv (`pyproject.toml`, `uv.lock`): FastAPI, uvicorn, httpx, opencv-python-headless, numpy, replicate, pydantic-settings, pytest, pytest-asyncio, respx, ruff; add `GET /api/health`; verify `uv run pytest` passes a health test and `uv run ruff check` is clean
- [x] 1.4 Replace `.env.example` contents (drop Postgres vars; keep `API_PORT=4000`, `CORS_ORIGIN`; add `REPLICATE_API_TOKEN`, `DETECTOR`, `REPLICATE_MODEL`, `REPLICATE_INPUT_TEMPLATE`, `REPLICATE_OUTPUT_FORMAT`, `POLL_INTERVAL_SECONDS`, `MAX_CONCURRENT_PREDICTIONS`, `AVAILABLE_CONFIRM_FRAMES`, `FRAME_RETENTION`, `VIEW_MASK`, `DATA_DIR`) and implement the matching `Settings` class; verify a settings unit test loads defaults and env overrides
- [ ] 1.5 Capture a fixture set of ~30 frames from cameras 04, 34 and 47 (including at least one viewpoint change if observed, and a night frame) into `apps/api/tests/fixtures/frames/`, with a small script `apps/api/scripts/capture_frames.py`; verify the fixtures load as 384×216 JPEGs in a test

## 2. API persistence (superseded by browser-owned state)

- [x] 2.1 Replace the original database repository with an in-memory per-browser session and browser snapshots for views, exemplars, zones and spacing samples; verify CRUD, isolation and snapshot round-trips
- [x] 2.2 Implement temporary frame file storage (`DATA_DIR/frames/{cameraId}/{frameId}.jpg`) with retention pruning that keeps session exemplar files; verify a test that writing 25 frames leaves 20 plus exemplars

## 3. Frame ingestion

- [x] 3.1 Implement camera id normalisation/validation (`^\d{1,3}$`, zero-pad to two digits) and URL parsing shared with the probe endpoint; verify tests for `4`→`04`, `47`, full URL, and rejected inputs
- [x] 3.2 Implement the source fetcher: conditional `If-Modified-Since`, `304` handling, JPEG SOI validation (empty `200` = failure), SHA-256 fallback dedupe, descriptive `User-Agent`, timeout; verify with respx-mocked tests for 200/304/empty/non-JPEG/timeout
- [x] 3.3 Implement `CameraMonitor` (poll loop, exponential backoff 5 s→60 s, offline after 3 failures, latest-wins analysis slot) and `WatchManager` (subscriber ref-counting, start on first / stop on last); verify async tests that two subscribers share one poller, the poller stops after the last unsubscribe, and intermediate frames are skipped while analysis is slow
- [x] 3.4 Add `GET /api/cameras/{id}/probe` (fetch + validate, returns preview frame URL or a 404/502 error body) and `GET /api/cameras/{id}/frames/{frameId}.jpg` (immutable cache headers, 404 when pruned); verify endpoint tests

## 4. Vehicle detection (Replicate)

- [x] 4.1 Benchmark spike: run two candidate Replicate detectors (one Grounding DINO-family open-vocabulary model, one YOLO-family model) over the fixture frames with ×2 and ×3 upscaling; record recall of parked cars, false positives, median latency and cost in `apps/api/docs/model-benchmark.md` and set the chosen default `REPLICATE_MODEL`/input template/output format in `.env.example`; verify the doc contains the comparison table and the chosen config
- [x] 4.2 Implement the `Detector` protocol, `ReplicateDetector` (upscale, data-URI input from template, output parsers, timeout, `Retry-After` handling, global concurrency semaphore) and `FakeDetector` (fixture-driven); verify tests with a mocked Replicate client covering parsing, confidence filtering, rate limit and timeout
- [x] 4.3 Map missing token → `analysis_disabled` and prediction failures → `analysis_unavailable` without stopping the image stream; verify tests for both statuses

## 5. Camera view recognition

- [x] 5.1 Implement frame quality check (banner mask from `VIEW_MASK`, Laplacian blur and luminance thresholds → `low_quality`); verify tests on a sharp fixture, a synthetic blurred copy and a dark frame
- [x] 5.2 Implement view matching (mask, ×2 upscale, CLAHE, ORB, ratio test, RANSAC homography, near-rigid sanity check, confidence) with in-memory feature cache per view; verify tests: same-view fixtures with different traffic/timestamps match, a shifted crop matches with the expected translation, and a different-viewpoint frame is `unknown_view`
- [x] 5.3 Implement exemplar management (user reference + up to 5 brightness-diverse auto exemplars) and view REST endpoints (`GET|POST /api/cameras/{id}/views`, `PATCH|DELETE /api/views/{viewId}`, `POST /api/views/{viewId}/reference`); verify endpoint tests including that deleting a view deletes its zones and that a night fixture matches after a night exemplar is added

## 6. Parking zones and occupancy

- [x] 6.1 Implement zone REST endpoints (`GET|POST /api/views/{viewId}/zones`, `PATCH|DELETE /api/zones/{zoneId}`) with validation (2–64 points, coords in `[0,1]`, band widths > 0); verify endpoint tests for valid, too-few-points and out-of-range payloads
- [x] 6.2 Implement zone geometry: homography warp, arc-length parameterisation, interpolated band, ground point, vehicle-to-zone assignment, occupied-interval projection; verify unit tests with synthetic polylines for inside-band, straddling, and in-lane vehicles
- [x] 6.3 Implement car-length model (rolling samples per zone, linear fit, band-derived fallback) and gap computation in car units with margin and `minGapCars` override, plus available-gap polygons; verify unit tests for gap ≥ 1.15 car (1 space), too-small gap (0), and empty zone (n spaces)
- [x] 6.4 Implement hysteresis smoothing (200 bins, `AVAILABLE_CONFIRM_FRAMES`, reset on view change/unknown/low-quality); verify a test that a one-frame missed detection never yields availability
- [x] 6.5 Wire the full pipeline (quality → view match → detect → assign → gaps → smoothing) into `CameraMonitor`, producing the `analysis` result shape from design D2 (`totalAvailable = null` for non-`ok`); verify an integration test with `FakeDetector` over fixture frames producing expected statuses and counts

## 7. Real-time API

- [x] 7.1 Implement `/ws` (subscribe message with full set, `frame` / `analysis` / `camera_status` broadcasts, replay latest state on subscribe, cleanup on disconnect) and CORS from `CORS_ORIGIN`; verify tests with FastAPI's WebSocket test client covering subscribe, replay, broadcast and unsubscribe-stops-polling
- [x] 7.2 Document the REST + WebSocket contract in `apps/api/README.md` (message examples, statuses, env vars); verify every endpoint and message type in the code is listed

## 8. Web foundations and camera management

- [x] 8.1 Set up Tailwind tokens (light/dark via CSS variables), base layout, typed API/WS message types mirroring design D2; verify `npm run build -w apps/web` and type-check pass
- [x] 8.2 Implement `useCameraStore` with `persist` (`parking-vision:v1`, versioned, storage wrapper that degrades gracefully) and actions add/remove/rename/reorder/toggle-notify; verify Vitest tests for persistence, duplicate prevention and storage-unavailable fallback
- [x] 8.3 Implement the add-camera input (URL or id parsing, probe call with preview, inline errors, duplicate highlight) and the empty state with focused input; verify component tests for valid URL, bare id `04`, invalid input and unreachable camera
- [x] 8.4 Implement the `wsClient` (connect, jittered reconnect, re-subscribe on camera list change) and `useLiveStore`; verify tests with a mock WebSocket that list changes send a new `subscribe` and reconnection restores subscriptions

## 9. Live dashboard

- [x] 9.1 Implement `CameraCard`: preloaded frame crossfade keyed by `frameId`, SVG overlay (`viewBox 0 0 1 1`) with red occupied boxes, green available polygons and faint unassigned vehicles, overlays shown only for the displayed frame with "analysing" state, status badge, ≈ available count, time-since-update and stale indicator; verify component tests for each status and the frame/analysis mismatch case
- [x] 9.2 Add Framer Motion: grid `layout` animations, staggered overlay entrance, spring counters, `useReducedMotion` fallback; verify a test that reduced-motion renders without transform animations, and visually check in the browser preview
- [x] 9.3 Implement the focus view (`layoutId` shared-element transition, per-zone breakdown, entry points to view/zone editors, unknown-view call to action); verify component tests and a manual check on 375 px and desktop widths

## 10. View and zone editors (web)

- [x] 10.1 Implement the view manager UI (save current unknown frame as view, list/rename/re-capture/delete views) against the REST API; verify component tests with mocked fetch
- [x] 10.2 Implement the zone editor (SVG over reference image, click to add points, drag/insert/delete handles, near/far band sliders with live band preview, name and `minGapCars`, save/delete, ≥2 points rule); verify component tests for draw, edit, too-few-points and delete flows

## 11. Notifications

- [x] 11.1 Implement availability transition detection in `useLiveStore` (only `ok` status, 0→≥1 or zone's first gap, per-camera 2-minute cooldown bypassed on further increase); verify unit tests for open, unchanged, flapping and unknown-view cases
- [x] 11.2 Implement animated toasts linking to the focus view, browser `Notification` when the tab is hidden (permission requested from the toggle click; denied state explained), and optional chime (off by default) in settings; verify component tests with a mocked `Notification` API

## 12. Docker and integration

- [x] 12.1 Write `apps/api/Dockerfile` (uv, non-root, temporary frame storage) and `apps/web/Dockerfile` (multi-stage Node build → nginx with `/api` and `/ws` reverse proxy including WebSocket upgrade), rewrite `.dockerignore` so web sources are included, and add `docker-compose.yml` without a persistent API volume; verify `docker compose up --build` serves the app and `/api/health` through the web origin
- [x] 12.2 End-to-end check with `DETECTOR=fake`: add cameras `47` and `04`, save a view, draw a zone, observe red/green overlays and a toast on availability, reload and confirm cameras persist; record results in the root `README.md` "Getting started" section along with setup steps
- [x] 12.3 Live check with a real `REPLICATE_API_TOKEN` on cameras `04`, `34`, `47` for ~15 minutes: confirm predictions are created only for new images of watched cameras (compare API logs to `Last-Modified` changes), polling stops when the tab closes, and an unknown view is reported after a viewpoint change; note findings in `apps/api/docs/model-benchmark.md`

## Workflow follow-up

- Run `/opsx:archive` after implementation and review are complete to merge the specs into `openspec/specs/`.
