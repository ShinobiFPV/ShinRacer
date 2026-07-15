# Companion PWA Setup

The Companion PWA (`pwa/`) gives crew members a full mobile app experience —
Events, Comms, Mods, Stats, Links, Settings — from a browser, installed to
their home screen, with no Electron install and no app store. It's a
completely separate app from the Electron one: same backend, same brand,
different codebase, deployed independently.

This is a one-time setup guide for William (host). Crew members just need
[docs/FRIEND_SETUP.md](FRIEND_SETUP.md)'s "Option B" section.

## 1. nginx

The PWA is served by nginx on `shinobi`, reverse-proxying to the existing
Express backend. See **[docs/NGINX_SETUP.md](NGINX_SETUP.md)** for the
one-time install — do that first.

## 2. Push notifications (VAPID keys)

Web Push needs a VAPID key pair — a public/private key pair that identifies
this server to push services (Google's FCM, Apple's push service, etc.)
without needing per-platform credentials.

Generate a pair:

```bash
npx web-push generate-vapid-keys
```

Add all three values to `backend/.env` on shinobi:

```
VAPID_PUBLIC_KEY=<the public key printed above>
VAPID_PRIVATE_KEY=<the private key printed above>
VAPID_EMAIL=mailto:shinobi@shintech.local
```

Restart the backend to pick them up (`.\scripts\deploy-backend.ps1` does
this automatically). The public key is also served back to any client at
`GET /api/push/vapid-public-key` — the PWA needs it to call
`pushManager.subscribe()`, and it's safe to expose (only the private key
must stay on the backend).

## 3. Google sign-in for the PWA

The PWA reuses the same Google Cloud project and OAuth client the Mod
Manager already uses (see [docs/GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md))
— it just needs its own redirect URI added, since a browser-based PKCE flow
redirects to an `http://` URL instead of the Electron app's `accomp://`
scheme. See that doc's **"PWA redirect URI"** section, added alongside the
existing OAuth client setup steps, for exactly what to add and where.

## 4. Deploying

```powershell
.\scripts\deploy-pwa.ps1
```

Builds the PWA locally (`vite build`), copies `pwa/dist/*` to
`/var/www/shinracer-pwa` on the Pi, installs/refreshes the nginx config,
and prints a health check. Re-run this any time PWA code changes — the
backend (`.\scripts\deploy-backend.ps1`) is still a separate deploy, same as
it's always been.

## 5. Getting on it from a phone

1. **Join Tailscale** on the phone — [tailscale.com/download](https://tailscale.com/download).
   Get an invite link from William if you don't have one yet.
2. Open **`http://192.168.1.203:8080`** in the phone's browser (Safari on iOS,
   Chrome on Android).
3. Add it to the home screen — see below. From then on it opens like any
   other installed app: own icon, no browser chrome, works offline for
   anything already cached.

### iOS (Safari)

Share icon (box with the up arrow) → **Add to Home Screen** → **Add**.

### Android (Chrome)

⋮ menu (top right) → **Add to Home Screen** (or **Install app**, depending
on Chrome version) → **Install**.

No App Store, no Play Store — just the link, same as any other bookmark.

## Verifying it worked

- Visiting `http://192.168.1.203:8080/` loads the ShinRacer sign-in/onboarding flow.
  (Note: the bare IP root on port 80 is imq2's Q2 web app, not ShinRacer —
  ShinRacer runs on its own port specifically so it doesn't collide with that.)
- The four-step onboarding completes and lands on Events.
- `Settings → Notifications → Enable notifications` prompts for permission,
  and `Test notification` (once granted) actually shows a system
  notification — proof the whole subscribe → VAPID → push round-trip works.
- Installing to the home screen shows the ShinRacer icon (blue "SR" mark on
  black — see the note in CLAUDE.md's Phase 10 section on why it's not a
  fully rendered Rubik Mono One wordmark yet) and launches without browser chrome.
