# Parking Vision

See free street parking before you get there. The app watches public JPEG traffic cameras,
including Vigo's (`https://camaras.vigo.org/webcam/cam.php?id=NN`), detects vehicles with an
AI model on [Replicate](https://replicate.com), and marks curb space as **occupied (red)** or
**available (green)**. It alerts you when a space opens.

- **No accounts or server database.** Cameras, views and zones live in your browser;
  reference images use IndexedDB. Use **Data → Export data** for a portable backup.
- **Cameras that turn.** Vigo's cameras rotate between a few fixed viewpoints. You save each
  viewpoint once and draw its curb lines; every frame is matched to the right viewpoint
  (small pans are compensated automatically). Unknown viewpoints never report availability.
- **Pay only for what you watch.** A camera is analysed only while someone has it open, and
  only when the source publishes a new image.

```
apps/web   React + TypeScript + Tailwind + Framer Motion + Zustand (Vite), Feature-Sliced Design → see apps/web/README.md
apps/api   Python + FastAPI + OpenCV, Replicate   → see apps/api/README.md
```

## Getting started

### With Docker

```bash
cp .env.example .env          # optional: set DETECTOR=fake for local UI work
docker compose up --build
```

Open <http://localhost:8080>. nginx serves the web app and proxies `/api` and `/ws` to the
API. Views and zones are restored from the browser when the app opens; the API keeps only
temporary analysis state and camera frames. The API is also exposed
on `localhost:${API_PORT:-4000}`.

### Local development

Requirements: Node 20+, [uv](https://docs.astral.sh/uv/) (Python 3.12 is installed by uv).

```bash
npm install
(cd apps/api && uv sync)
npm run dev:api     # FastAPI on :4000 (reads .env from the repo root)
npm run dev         # Vite on :5173, proxies /api and /ws to :4000
```

Without a Replicate key saved in the browser, images still stream and the cards show
**AI disabled**. Set `DETECTOR=fake` to get deterministic pretend detections for UI work.

```bash
npm test            # web (Vitest) + api (pytest)
npm run lint        # ESLint + Prettier + Ruff
```

## Your Replicate key

Vehicle detection runs on [Replicate](https://replicate.com) with **each person's own API
token**, so whoever watches a camera pays for its analysis, and the person hosting the app
pays nothing for AI. There is no server-side token: the API never reads one from `.env` or
anywhere else.

1. Create a token at <https://replicate.com/account/api-tokens>. Replicate charges for
   each analysis; with less than $5 of credit it allows about 6 predictions a minute.
2. Paste it into the **Connect AI** dialog (shown on first visit, or from **Connect AI** /
   **AI connected** in the header). A complete token saves automatically; you can also
   continue without one, and images still stream with the cards showing **AI disabled**.

Where the key goes:

- It is stored **only in your browser** (`localStorage`). Browser storage is not encrypted:
  anyone with access to the browser profile, or a malicious script on the site, could read
  it. **Data → Export** does not include it.
- It is sent **only to the Parking Vision API you are connected to**, over the live
  connection, and from there to Replicate. The API keeps it in memory while you watch,
  never writes it to disk or logs, and drops it once you stop watching.
- A camera is analysed only while you have it open and only when its source publishes a new
  image, so you pay only for what you watch. Remove the key at any time from **AI
  connected → Remove key**, and revoke it on Replicate if you think it was exposed.

> **Only enter your key in an instance you trust.** Whoever runs the server could modify it
> to read keys. The safest option is to run your own copy (see [Getting started](#getting-started)).

## Using it

The **Data** menu imports and exports the camera list, views, zones, learned spacing samples and their
reference images as JSON. Import replaces the current browser configuration. Previous
server-side data must be exported to this format before upgrading; the API no longer reads
old database files.

1. **Add a camera.** Click **Find cameras near me** (or **Add camera** in the header) and
   tap a camera, or type a city, street, road or province in the search box. One search
   covers the municipal street cameras of Vigo, Madrid and Málaga and the DGT road cameras of
   every Spanish province, each with a live preview; with your location the closest cameras
   come first. Tap the star in the search box to save a search: saved searches appear as
   pills under it (and on the start screen) and are remembered in this browser.
   For any other city, choose **Add a camera by link** and paste a
   direct public JPEG image URL, or a Vigo link
   (`https://camaras.vigo.org/webcam/cam.php?id=47`) or number (`47`, `04`). The app checks
   the current image before adding it. The URL must return a JPEG without login or
   redirects; a webpage or video stream will not work. The camera's URL stays in your
   browser's watchlist and data export. Availability depends on the source publishing fresh
   images and showing a usable view of curb parking.
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

## Hosting a public instance

The Docker setup is meant for running your own copy. Before putting it on the internet for
other people:

- **Serve it over HTTPS only.** The key travels from the browser to the API; on plain HTTP
  anyone on the network can read it. Put the `web` container behind a TLS-terminating proxy
  (Caddy, Traefik, a load balancer…).
- **Expose only the web container.** nginx in `web` already proxies `/api` and `/ws`; remove
  the `api` port mapping from `docker-compose.yml` (or bind it to `127.0.0.1`) so the API is
  not reachable directly, and set `CORS_ORIGIN` to your public URL.
- **You pay for bandwidth and CPU, not AI.** The server downloads camera images and runs
  view matching (OpenCV) for everyone watching. There are no accounts or rate limits, so add
  limits at your proxy if you expect heavy use.
- **Custom camera links are fetched by your server.** The API only fetches public HTTP(S)
  hosts on standard ports, checks that the address is public, doesn't follow redirects and
  caps images at 5 MB, but it still makes requests on your users' behalf.
- **Nothing to back up.** User data lives in browsers; the API's `DATA_DIR` only holds
  temporary frames (`/tmp/parking-vision` in Docker).

## Camera data

The built-in camera directory is loaded live from public open-data portals and cached by
the API for 6 hours. Images belong to their publishers and are shown with attribution in
the app:

| Source | Cameras | Publisher |
|---|---|---|
| Vigo | City street cameras | [Concello de Vigo open data](https://datos.vigo.org) |
| Madrid | City street cameras | [Ayuntamiento de Madrid open data](https://datos.madrid.es) |
| Málaga | City street cameras | [Ayuntamiento de Málaga open data](https://datosabiertos.malaga.eu) |
| All of Spain | Road cameras by province | [DGT National Access Point](https://nap.dgt.es) |

Check each publisher's terms before running a public instance. To add a city, add a loader
in `apps/api/app/catalog.py` that maps its listing to cameras with a name, coordinates and a
direct JPEG URL.

## License

[MIT](LICENSE) © 2026 Jose Ramon Montes Hermida. The license covers this code, not the
camera images or the Replicate models it uses.
