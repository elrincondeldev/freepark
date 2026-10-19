# Proposal

## Why

Finding street parking in Vigo means driving around blind, yet the city already publishes public traffic cameras (`https://camaras.vigo.org/webcam/cam.php?id=<NN>`) whose images refresh every few tens of seconds. Turning those images into a live "free / occupied" view of the curbs a driver cares about, with an alert when a gap opens, gives a practical parking aid at almost no infrastructure cost.

## What Changes

- New Dockerized monorepo (`apps/web` + `apps/api`, orchestrated by `docker-compose.yml`) — greenfield; the repo currently holds only config files.
- **Frontend** (React + TypeScript + Tailwind + Framer Motion + Zustand): a minimalist live dashboard of the user's watched cameras with animated red (occupied) / green (available) overlays, a camera picker that persists to browser `localStorage`, an editor to draw curb parking lines for each camera view, and in-app + browser notifications. No authentication.
- **Backend** (Python + FastAPI): watches only cameras that at least one open client is subscribed to, detects new images via HTTP conditional requests (`Last-Modified` / `304`), runs vehicle detection through Replicate, recognises which viewpoint the camera is currently showing, computes free curb gaps, and streams results to clients over a WebSocket.
- **Perspective handling**: cameras rotate between viewpoints. Each camera can hold several stored *views*; every frame is matched to a known view (with small-drift correction) or flagged as an unknown view that needs zones drawn. Availability is only reported for frames whose view is recognised.
- **Approximate zones, not exact bays**: users draw curb lines (polylines with a tolerance band) where cars can park; vehicles that sit partly inside or outside the band still count. Free space is the length of the gaps between parked vehicles along each line, compared with a perspective-scaled car length.
- Browser-owned persistence for cameras, views and zones, with reference images in IndexedDB; the API holds temporary analysis sessions and frames. `.env.example` contains Replicate settings.

## Capabilities

### New Capabilities
- `camera-management`: adding, validating, removing and persisting the user's watched cameras in the browser.
- `frame-ingestion`: watch-driven polling of camera images, update detection, frame storage and serving.
- `camera-view-recognition`: identifying which viewpoint a frame shows, tracking viewpoint changes, and registering new views.
- `parking-zones`: drawing, editing and storing approximate curb parking lines per camera view.
- `occupancy-detection`: vehicle detection through Replicate and computation of occupied / available curb segments.
- `live-parking-dashboard`: real-time streaming of frames and occupancy to the UI and their animated rendering.
- `availability-notifications`: alerting the user when parking becomes available on a watched camera.

### Modified Capabilities
_None — no existing specs._

## Impact

- **New code**: `apps/web/` (Vite React app), `apps/api/` (FastAPI service), `docker-compose.yml`, per-app Dockerfiles, root `package.json`.
- **Config**: `.env.example` (replace Postgres vars with `REPLICATE_API_TOKEN`, model settings, poll interval; keep `API_PORT=4000`, `CORS_ORIGIN`), `.dockerignore` (currently excludes `apps/web/src` and `apps/web/public`, which would break the web image build), `.claude/launch.json` already expects `npm run dev` on port 5173.
- **External dependencies**: `camaras.vigo.org` (public, unauthenticated, 384×216 JPEG with a burned-in timestamp banner); Replicate API (paid per prediction — cost bounded by analysing only watched cameras and only new images).
- **Out of scope**: user accounts, background Web Push / Telegram alerts, 24/7 monitoring of unwatched cameras, automatic discovery of the city camera catalogue, historical analytics.
