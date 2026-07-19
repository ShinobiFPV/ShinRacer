# Google OAuth Setup

ShinRacer's Electron app signs everyone in with Google (mandatory since
Phase 12 — see `docs/ADMIN_SETUP.md`). Sign-in uses the same OAuth 2.0
client the Mod Manager's uploads already use (see
`docs/GOOGLE_DRIVE_SETUP.md`, section 3) — there's only one OAuth client
for the *Electron app*.

**The PWA needs a second, separate OAuth client — see "PWA (Web
application client)" below.** The Electron client is registered as
**Desktop app** type (that's specifically why the old `accomp://oauth`
scheme was rejected in the first place — see the loopback section right
below). Desktop app clients don't have an editable "Authorized redirect
URIs" list in Google Cloud Console at all; Google auto-manages loopback
URIs for that type and nothing else. The PWA's web-based flow needs an
arbitrary HTTPS host in that list, which a Desktop app client structurally
cannot provide — this isn't a propagation delay or a typo, adding the PWA's
URL to the Electron client will show `Error 400: redirect_uri_mismatch`
(or you won't find a redirect-URI field to edit at all) no matter how long
you wait.

## Loopback redirect (not accomp://oauth)

Google's OAuth 2.0 policy for "Desktop app" clients rejects custom URI
scheme redirects (`accomp://oauth`) outright — Google returns
`Error 400: invalid_request` at the consent screen. The supported
mechanism for installed apps is a loopback IP address redirect instead:
https://developers.google.com/identity/protocols/oauth2/native-app

ShinRacer now runs a temporary local HTTP server on `127.0.0.1:9721`
during sign-in (`src/main/main.js`'s `auth:startCallbackServer` IPC
handler) that catches Google's redirect directly, reads the `code` off
the query string, and closes itself after that one request — no
`accomp://` protocol handoff is involved for OAuth anymore. `accomp://`
itself is still registered and still used for invite links and other deep
links (see `main.js`'s `handleAccompUrl`).

## Authorized redirect URIs

Remove (if present):

```
accomp://oauth
```

Add:

```
http://127.0.0.1:9721
```

Go to [console.cloud.google.com](https://console.cloud.google.com) →
**APIs & Services → Credentials → OAuth 2.0 Client IDs** → click your
client → **Edit**. Under **Authorized redirect URIs**:

1. Delete `accomp://oauth`.
2. Add `http://127.0.0.1:9721`.
3. Save.

Google may take a few minutes to propagate the change — if sign-in still
fails right after saving, wait a bit and retry before assuming something's
misconfigured.

## Backend config

`backend/.env` needs `GOOGLE_OAUTH_REDIRECT_URI` updated to match:

```
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:9721
```

This must match **exactly** what's registered in Google Cloud Console —
including no trailing slash. **If the backend is already deployed on
your-pi, its `.env` still has the old `accomp://oauth` value and needs to
be updated there too** — edit
`/home/your-pi/ac-companion-backend/.env` directly and restart the
service:

```bash
sudo systemctl restart ac-companion
```

Or redeploy from Windows, which restarts it automatically:

```powershell
.\scripts\deploy-backend.ps1
```

## Sign-in error handling

If sign-in fails with an error message containing `redirect_uri_mismatch`,
the Wizard shows:

> OAuth not configured — see docs/GOOGLE_OAUTH_SETUP.md

pointing back at this file, instead of the raw Google error text.

If no callback is received within 5 minutes of opening the browser (the
tab was closed, or the consent screen was never completed), the local
callback server closes itself automatically and the Wizard shows "Sign in
timed out — please try again."

## PWA (Web application client)

The PWA needs its **own** OAuth client, separate from the Electron app's
Desktop app client above — see the explanation at the top of this file for
why. This one **does** get an editable "Authorized redirect URIs" list,
because it's the right client type for a web-based redirect flow.

### Create the client

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs &
   Services → Credentials** → **+ Create Credentials → OAuth client ID**.
2. **Application type: Web application.**
3. Name it something recognizable, e.g. "ShinRacer PWA".
4. Under **Authorized redirect URIs**, add:
   ```
   https://your-pi.tail9249a1.ts.net:8443/auth/callback
   ```
   (Adjust the hostname/port if yours differs — see "Where the PWA lives"
   below for why it's `:8443` and not `:8080` or plain `:443`.)
5. **Create.** Google shows you a **Client ID** and **Client Secret** —
   copy both now, the secret isn't shown again later (you can always
   generate a new one from the client's page if you lose it).

### Backend config

Add both to `backend/.env` on your-pi:

```
GOOGLE_OAUTH_CLIENT_ID_PWA=<the Client ID from step 5>
GOOGLE_OAUTH_CLIENT_SECRET_PWA=<the Client Secret from step 5>
GOOGLE_OAUTH_REDIRECT_URI_PWA=https://your-pi.tail9249a1.ts.net:8443/auth/callback
```

This must match **exactly** what's registered in Google Cloud Console.
Restart the backend to pick it up:

```bash
sudo systemctl restart ac-companion
```

`GET /api/auth/config` (what the PWA actually fetches to build its own
auth URL — see `pwa/src/hooks/useAuth.js`) returns
`GOOGLE_OAUTH_CLIENT_ID_PWA`, not the Electron app's client ID — a request
against the wrong client ID would 400 immediately, so this is a good
smoke test:

```bash
curl -s https://your-pi.tail9249a1.ts.net:8443/api/auth/config
```

### Where the PWA lives

The PWA is served over plain HTTP on `:8080` (nginx, LAN/Tailscale IP —
see `docs/PWA_SETUP.md`) **and** over HTTPS on `:8443` via **Tailscale
Serve** (`tailscale serve --bg --https=8443 http://127.0.0.1:8080` on
your-pi — reverse-proxies into the same nginx `:8080` block, Tailscale
handles the cert itself, no nginx TLS config needed). The `:8080` URL still
works for browsing, but **Google sign-in only works over the `:8443` HTTPS
URL** — `crypto.subtle` (needed for the PKCE code challenge) only exists in
a secure context, and Google's OAuth server outright rejects `redirect_uri`
values that are bare IP addresses ("device_id and device_name needed for
private IP" — a real, distinct Google policy, not related to
`crypto.subtle`).

`:8443`, not plain `:443`, because port 443 on this hostname is already
claimed by **Tailscale Funnel** for a different app on this shared Pi
(imq2/Q2, proxying to port 80) — check `tailscale serve status` on your-pi
before reassigning it. The PWA's own mapping is tailnet-only (not Funnel'd
to the public internet), which is correct for a friends-only app.
