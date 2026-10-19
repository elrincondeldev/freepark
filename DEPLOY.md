# Deploying FreePark

FreePark runs on one small server: [Caddy](https://caddyserver.com) serves HTTPS (with
automatic Let's Encrypt certificates) and forwards everything to the web container, which
serves the app and proxies `/api` and `/ws` to the API. Only Caddy is reachable from the
internet.

```
browser ──https──▶ caddy :443 ──▶ web (nginx) ──/api, /ws──▶ api (FastAPI)
```

This guide uses a [Hetzner Cloud](https://www.hetzner.com/cloud) server and a domain
managed in Squarespace (`getfreepark.com`). Any Linux server with Docker works the same way.

**Cost:** one small server, roughly €4–7 a month. There is no database and nothing to back
up: users' data lives in their browsers, and each user pays for AI analysis with their own
Replicate key.

## 1. Create the server (Hetzner)

1. Sign up at [console.hetzner.cloud](https://console.hetzner.cloud) and create a project
   (e.g. `freepark`).
2. If you don't have an SSH key yet, create one on your computer and copy the public part:

   ```bash
   ssh-keygen -t ed25519 -C "freepark"
   ```
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

3. **Add Server** with these options:

   | Option | Choose |
   |---|---|
   | Location | Nuremberg or Falkenstein (Germany), the closest to Spain |
   | Image | Ubuntu 24.04 |
   | Type | Shared vCPU · x86 · **CX23** (2 vCPU, 4 GB), or the cheapest with at least 2 GB |
   | Networking | Public IPv4 **on** (needed for most visitors) and IPv6 on |
   | SSH keys | Paste the public key from step 2 |
   | Firewalls | Create one allowing inbound **TCP 22, 80, 443** and **UDP 443** |
   | Backups | Off (there is nothing to back up) |
   | Name | `freepark` |

4. Note the server's **IPv4** (and IPv6) address shown after it's created.

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
git clone https://github.com/elrincondeldev/parking-vision.git /opt/freepark
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
  `dig +short getfreepark.com`), or ports 80/443 are closed in the Hetzner firewall. Caddy
  retries on its own once that's fixed. If you added an AAAA record, it must be the server's
  IPv6.
- **502 Bad Gateway right after an update:** the API is still starting; wait a few seconds.
- **"Can't reach the camera directory" in the app:** see `docker compose logs api`. A city's
  open-data portal may be down; the rest keep working.

## Notes

- The domain lives in one place: `DOMAIN` in `.env`. Share tags in
  `apps/web/index.html` also use `https://getfreepark.com`; change both if you use another
  domain.
- To stop paying, delete the server in the Hetzner console (billing is hourly).
