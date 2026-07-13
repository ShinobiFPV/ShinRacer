# nginx Setup — Companion PWA

The PWA is a static build served by nginx on `shinobi`, on port 8080 (not 80 —
the bare IP root is already claimed by imq2's own web app), alongside the
existing Express backend on port 3000. nginx serves the PWA's files directly
and reverse-proxies `/api/` and `/socket.io/` through to the backend, so the PWA
and the backend look like a single origin to the browser.

This is a one-time setup on the Pi. After it's done, `.\scripts\deploy-pwa.ps1`
handles every future update.

## 1. Install nginx

```bash
sudo apt update
sudo apt install nginx
```

## 2. Install the site config

`backend/nginx/shinracer.conf` is checked into this repo and copied up by
`deploy-pwa.ps1`. First time only, install it manually:

```bash
sudo cp ~/shinracer-pwa/nginx/shinracer.conf /etc/nginx/sites-available/shinracer
sudo ln -s /etc/nginx/sites-available/shinracer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

(`deploy-pwa.ps1` runs the equivalent of the last four of these commands
automatically on every deploy — this manual pass is only needed the very
first time, before `sites-available/shinracer` exists.)

## 3. What the config does

- Serves `/var/www/shinracer-pwa` (the PWA's built `dist/` output) as
  static files, with SPA fallback (`try_files ... /index.html`) so client-side
  routes like `/events/evt_123` don't 404 on a hard refresh. Deliberately
  outside `/home/shinobi` — a Pi user's home directory defaults to `700`,
  which blocks nginx's `www-data` worker from even traversing into it;
  `/var/www` is the standard, world-traversable location for this exact
  reason.
- `/auth/callback` explicitly falls through to `index.html` too — it's a
  client-side route (`AuthCallbackPage`), not a real file, but it needs its
  own `location` block since it doesn't have an extension nginx would
  otherwise treat as "probably a real file."
- `/api/` and `/socket.io/` reverse-proxy to `127.0.0.1:3000` (the Express
  backend), with the `Upgrade`/`Connection` headers Socket.io's websocket
  upgrade needs.
- JS/CSS/image/font assets get a 1-year immutable cache — safe because Vite
  fingerprints every built filename, so a new build always gets new
  filenames rather than overwriting a cached one.
- `sw.js` (the service worker itself) is explicitly never cached, so a new
  deploy's service worker update is picked up promptly instead of serving a
  stale one from the browser's HTTP cache.

## 4. Verifying it worked

- `http://192.168.1.203:8080/` (or `http://shinracer.local:8080/` if you've
  set up mDNS) should load the PWA. Port 8080, not 80 — the bare IP root on
  this Pi is already claimed by imq2's own web app.
- `http://192.168.1.203:8080/api/health` should return the same JSON the
  backend itself returns on port 3000 — proof the reverse proxy is wired
  correctly.
- `sudo nginx -t` should always report `syntax is ok` / `test is successful`
  before a reload — `deploy-pwa.ps1` already runs this for you on every deploy.

## Troubleshooting

- **502 Bad Gateway on `/api/*`** — the Express backend isn't running.
  Check `sudo systemctl status ac-companion`.
- **Blank page / assets 404** — `dist/` wasn't actually deployed, or nginx's
  `root` doesn't match where `deploy-pwa.ps1` copied it
  (`/var/www/shinracer-pwa`). Confirm with `ls /var/www/shinracer-pwa`.
- **500 / "Permission denied" in `nginx error.log`** — nginx's `www-data`
  worker can't read the static root. Confirm ownership/permissions with
  `namei -om /var/www/shinracer-pwa/index.html` — every directory in the
  chain needs at least execute (traversal) permission for `www-data`.
- **Socket.io falls back to polling instead of websockets** — check that the
  `Upgrade`/`Connection` headers in the `/socket.io/` block weren't stripped
  by an intermediate proxy (unlikely on a direct Tailscale/LAN connection,
  but worth checking if voice/chat feel laggy).
