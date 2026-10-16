# Parking Vision

See free street parking in Vigo before you get there. The app watches the city's public
traffic cameras (`https://camaras.vigo.org/webcam/cam.php?id=NN`), detects vehicles with an
AI model on [Replicate](https://replicate.com), and marks curb space as **occupied (red)** or
**available (green)**. It alerts you when a space opens.

- **No accounts.** Your camera list lives in your browser's `localStorage`.
- **Cameras that turn.** Vigo's cameras rotate between a few fixed viewpoints. You save each
  viewpoint once and draw its curb lines; every frame is matched to the right viewpoint
  (small pans are compensated automatically). Unknown viewpoints never report availability.
- **Pay only for what you watch.** A camera is analysed only while someone has it open, and
  only when the source publishes a new image.

```
apps/web   React + TypeScript + Tailwind + Framer Motion + Zustand (Vite), Feature-Sliced Design → see apps/web/README.md
apps/api   Python + FastAPI + OpenCV, SQLite, Replicate   → see apps/api/README.md
```

## Getting started

### With Docker

```bash
cp .env.example .env          # then set REPLICATE_API_TOKEN (optional: DETECTOR=fake)
docker compose up --build
```

Open <http://localhost:8080>. nginx serves the web app and proxies `/api` and `/ws` to the
API, which stores views, zones and frames in the `api-data` volume. The API is also exposed
on `localhost:${API_PORT:-4000}`.

### Local development

Requirements: Node 20+, [uv](https://docs.astral.sh/uv/) (Python 3.12 is installed by uv).

```bash
npm install
(cd apps/api && uv sync)
npm run dev:api     # FastAPI on :4000 (reads .env from the repo root)
npm run dev         # Vite on :5173, proxies /api and /ws to :4000
```

Without a Replicate token, images still stream and the cards show **AI disabled**. Set
`DETECTOR=fake` to get deterministic pretend detections for UI work.

```bash
npm test            # web (Vitest) + api (pytest)
npm run lint        # ESLint + Prettier + Ruff
```

## Using it

1. **Add a camera.** Paste its link (`https://camaras.vigo.org/webcam/cam.php?id=47`) or
   type its number (`47`, `04`). A preview confirms the camera is reachable.
2. **Save the view.** A new camera shows **Unknown view**. Click **Save view**, name it
   (e.g. "Towards the port") and you land in the zone editor.
3. **Draw curb zones.** Click along the kerb where cars park; double-click or press Enter
   to finish. A car counts as parked when it touches the band or sits right beside it, so
   adjust the band width (near and far from the camera) until it touches the parked cars.
   Save.
4. **Watch.** Red boxes are cars occupying a zone; green areas are gaps long enough for
   at least one car. A gap is shown as free only after it has been free in two consecutive
   images, so one missed detection doesn't create a false space.
5. **Get alerts.** Turn on the bell on a camera. You get an animated toast when a space
   opens, plus a browser notification while the tab is in the background (if you allow
   them) and an optional chime (speaker icon in the header).

When the camera turns to another viewpoint you have saved, its zones apply automatically.
When it turns somewhere new, save that view too.
