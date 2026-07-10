# Google OAuth Setup

ShinRacer's Electron app signs everyone in with Google (mandatory since
Phase 12 — see `docs/ADMIN_SETUP.md`). Sign-in uses the same OAuth 2.0
client the Mod Manager's uploads already use (see
`docs/GOOGLE_DRIVE_SETUP.md`, section 3) — there's only one OAuth client
for the whole app, not a separate one per feature.

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
shinobi, its `.env` still has the old `accomp://oauth` value and needs to
be updated there too** — edit
`/home/shinobi/ac-companion-backend/.env` directly and restart the
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
