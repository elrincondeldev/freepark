# Deploying FreePark

FreePark runs on one small server: [Caddy](https://caddyserver.com) serves HTTPS (with
automatic Let's Encrypt certificates) and forwards everything to the web container, which
serves the app and proxies `/api` and `/ws` to the API. Only Caddy is reachable from the
internet.

```
browser ──https──▶ caddy :443 ──▶ web (nginx) ──/api, /ws──▶ api (FastAPI)
```

This guide uses a server in Spain from [Clouding.io](https://clouding.io) (Barcelona) and a
domain managed in Squarespace (`getfreepark.com`). Any Linux server with Docker works the
same way, **as long as it is in Spain** (see below).

**Cost:** one small server, roughly €5–7 a month. There is no database and nothing to back
up: users' data lives in their browsers, and each user pays for AI analysis with their own
Replicate key.

> **Why a server in Spain?** Some camera publishers only accept connections from Spanish IP
> addresses. Vigo's and Málaga's camera servers refuse servers abroad (we tested from
> Germany), while Madrid and the DGT accept them. From a server outside Spain, adding a Vigo
> or Málaga camera fails with "FreePark couldn't get an image from this camera", and the API
> logs `camera images for vigo can't be fetched from this server`.

## 1. Create the server (in Spain)

1. If you don't have an SSH key yet, create one on your computer and copy the public part:

   ```bash
   ssh-keygen -t ed25519 -C "freepark"
   ```
   ```bash
   pbcopy < ~/.ssh/id_ed25519.pub
   ```

   (`pbcopy` is macOS; elsewhere print it with `cat ~/.ssh/id_ed25519.pub`.)

2. Sign up at [clouding.io](https://clouding.io), add your SSH key (paste the public key),
   and create a server with:

   | Option | Choose |
   |---|---|
   | Location | Spain (Barcelona) |
   | Image | Ubuntu 24.04 |
   | Size | **2 GB RAM**, 1–2 vCPU (the first build needs ~1.5 GB; the app itself uses far less) |
   | Disk | the smallest offered (FreePark uses about 3 GB) |
   | SSH key | the one from step 1 |
   | Firewall | allow inbound **TCP 22, 80, 443** and **UDP 443** |
   | Name | `freepark` |

3. Note the server's public **IPv4** address.

4. **Check that the camera publishers accept this server** before going further. Log in
   (`ssh root@YOUR_SERVER_IP`) and run:

   ```bash
   curl -s -o /dev/null -m 15 -w "vigo: %{http_code} %{size_download} bytes\n" "https://camaras.vigo.org/webcam/cam.php?id=09"; curl -s -o /dev/null -m 15 -w "malaga: %{http_code} %{size_download} bytes\n" "https://ctraficomovilidad.malaga.eu/recursos/movilidad/camaras_trafico/TV-87.jpg"
   ```

   Both lines should say `200` and thousands of bytes. `000 0 bytes` means that publisher
   blocks this server: pick another provider in Spain.

## 2. Point the domain at the server (Squarespace)

In Squarespace, open **Domains → getfreepark.com → DNS** (DNS Settings):

1. Under **Squarespace Defaults**, delete the default records that point the domain at
   Squarespace (the `@` A records and the `www` CNAME). Keep any **MX** records if you use
   email on this domain.
2. Under **Custom Records**, add:

   | Type | Host | Data |
   |---|---|---|
   | A | `@` | your server's IPv4 |
   | AAAA | `@` | your server's IPv6 (optional) |
   | CNAME | `www` | `getfreepark.com` |

   If Squarespace won't accept the CNAME, add an **A** record for `www` with the IPv4 instead.

3. Wait until the domain resolves to your server (usually minutes, sometimes up to a few
   hours):

   ```bash
   dig +short getfreepark.com
   ```

## 3. Install Docker on the server

```bash
ssh root@YOUR_SERVER_IP
```
```bash
apt update && apt upgrade -y && curl -fsSL https://get.docker.com | sh
```

Ubuntu installs security updates automatically (unattended-upgrades is on by default).

## 4. Start FreePark

```bash
git clone https://github.com/elrincondeldev/freepark.git /opt/freepark
```
```bash
cd /opt/freepark && printf 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml\nDOMAIN=getfreepark.com\n' > .env
```
```bash
docker compose up -d --build
```

The first build takes a few minutes. Then watch Caddy get the certificate (press Ctrl+C to
stop following the log):

```bash
docker compose logs -f caddy
```

Open <https://getfreepark.com> (landing page) and <https://getfreepark.com/app> (the app).
`https://getfreepark.com/api/health` should return `{"status":"ok"}`.

Other settings from [`.env.example`](.env.example) (polling interval, detection model…) can
go in the same `.env`.

## Updating

After pushing changes to GitHub:

```bash
cd /opt/freepark && git pull && docker compose up -d --build && docker image prune -f
```

Users' cameras and settings are kept in their browsers, so updates don't lose anything.
Viewers reconnect automatically after the API restarts.

## Day to day

| Task | Command (in `/opt/freepark`) |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f api` (or `web`, `caddy`) |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |

- Containers restart on their own after a crash or a server reboot.
- Logs are capped at 30 MB per container, so they can't fill the disk.
- For free uptime alerts, point a monitor (UptimeRobot, Better Stack…) at
  `https://getfreepark.com/api/health`.

## Troubleshooting

- **No certificate / browser warning:** the domain doesn't point at the server yet (check
  `dig +short getfreepark.com`), or ports 80/443 are closed in your provider's firewall. Caddy
  retries on its own once that's fixed. If you added an AAAA record, it must be the server's
  IPv6.
- **502 Bad Gateway right after an update:** the API is still starting; wait a few seconds.
- **"Can't reach the camera directory" in the app:** see `docker compose logs api`. A city's
  open-data portal may be down; the rest keep working.

## Notes

- The domain lives in one place: `DOMAIN` in `.env`. Share tags in
  `apps/web/index.html` also use `https://getfreepark.com`; change both if you use another
  domain.
- To stop paying, delete the server in your provider's console.
