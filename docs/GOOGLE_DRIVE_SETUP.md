# Google Drive Setup — Mod Manager

The Mod Manager reads and writes a shared "ShinTech Mods" Google Drive folder
through the backend running on `your-pi`. Downloads use a service account —
no *Drive* login needed to actually fetch a file, since it's the service
account's read access doing the work, not the friend's own — while uploads
use each person's own Google account via OAuth. This is a one-time setup
William needs to do on the Pi.

Since Phase 12, signing in to ShinRacer itself (Google, same account either
way) is mandatory app-wide — see [docs/ADMIN_SETUP.md](ADMIN_SETUP.md) — so
"no login required" here is specifically about the *Drive* API call, not
about reaching the Mods view in the first place.

## 1. Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (e.g. "ShinRacer Mods").
2. In **APIs & Services → Library**, enable:
   - **Google Drive API**
   - **Google People API** (used to read the uploader's name/email/picture on sign-in)

## 2. Service account (for downloads)

1. **APIs & Services → Credentials → Create Credentials → Service Account**.
2. Give it any name (e.g. `shinracer-mods-reader`) — no roles needed at the project level.
3. Open the new service account → **Keys → Add Key → Create new key → JSON**. This downloads a `.json` key file.
4. Copy that file to the Pi:
   ```
   /home/your-pi/ac-companion-backend/service-account.json
   ```
5. Note the service account's email address (looks like `shinracer-mods-reader@your-project.iam.gserviceaccount.com`) — you need it in the next step.
6. In Google Drive, open the **ShinTech Mods** root folder → **Share** → paste the service account email → set permission to **Viewer** → Share. The service account only ever reads (`drive.readonly` scope), so Viewer is enough.

## 3. OAuth 2.0 client (for uploads)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Under **Authorized redirect URIs**, add:
   ```
   accomp://oauth
   ```
4. Create it, then download the client secret (or just copy the **Client ID** and **Client Secret** shown after creation) — you'll paste these into `backend/.env` below.

## 3b. PWA redirect URI (Phase 10 addendum)

The Companion PWA signs in with the same OAuth client as above, but from a
browser instead of the Electron app — so it needs its own redirect URI added
to the same client, since Google requires an exact match and a browser can't
be redirected to `accomp://oauth`.

Back in **APIs & Services → Credentials**, open the OAuth client from step 3
and add these to **Authorized redirect URIs** (in addition to `accomp://oauth`,
which stays for the Electron app):

```
http://192.168.1.100:8080/auth/callback
http://shinracer.local:8080/auth/callback
```

Only add the `shinracer.local` one if you've actually set up mDNS for that
hostname — an unused redirect URI in the list is harmless, but there's no
need to add one you're not using. If you later put the PWA behind a real
domain with HTTPS, add `https://yourdomain.com/auth/callback` here too.

Then set `GOOGLE_OAUTH_REDIRECT_URI_PWA` in `backend/.env` to whichever one
the PWA is actually reachable at (see step 5 below) — this is what
`GET /api/auth/config` hands back to the PWA to build its sign-in URL with.

## 4. Folder IDs

Open each folder in Drive and copy the ID from the URL bar:
```
https://drive.google.com/drive/folders/{FOLDER_ID}
```

You need the ID for:
- **ShinTech Mods** (root folder, shared with the service account in step 2.6)
- **Cars**
- **Tracks**
- **Tools**
- **Uploads**

## 5. `backend/.env` on your-pi

Create (or edit) `/home/your-pi/ac-companion-backend/.env` with:

```
GOOGLE_SERVICE_ACCOUNT_PATH=/home/your-pi/ac-companion-backend/service-account.json
GOOGLE_DRIVE_ROOT_FOLDER_ID=<ShinTech Mods folder ID>
GOOGLE_DRIVE_CARS_FOLDER_ID=<Cars folder ID>
GOOGLE_DRIVE_TRACKS_FOLDER_ID=<Tracks folder ID>
GOOGLE_DRIVE_TOOLS_FOLDER_ID=<Tools folder ID>
GOOGLE_DRIVE_UPLOADS_FOLDER_ID=<Uploads folder ID>
GOOGLE_OAUTH_CLIENT_ID=<from step 3>
GOOGLE_OAUTH_CLIENT_SECRET=<from step 3>
GOOGLE_OAUTH_REDIRECT_URI=accomp://oauth
GOOGLE_OAUTH_REDIRECT_URI_PWA=<one of the URIs added in step 3b>
```

This file lives only on the Pi and is never committed to git or bundled into
the Electron app (`.env` and `.env.*` are gitignored everywhere in this repo).

The same variable names are also present, blank, in the repo's root
`.env.example`, and `backend/package.json`'s `dotenv` dependency loads this
file automatically on backend startup (`require('dotenv').config()` in
`server.js`). The PWA's own VAPID push-notification keys are a separate
concern — see [docs/PWA_SETUP.md](PWA_SETUP.md) for those.

## 6. Restart the backend

After creating/editing `.env`, restart the service so it picks up the new
variables:

```bash
sudo systemctl restart ac-companion
```

Or redeploy from Windows, which restarts it automatically:

```powershell
.\scripts\deploy-backend.ps1
```

## Verifying it worked

- `GET http://192.168.1.100:3000/api/mods` should return `{"ok":true,"data":{"cars":[...],"tracks":[...],"tools":[...],"uploads":[...]}}`.
- If it instead returns `{"ok":false,"error":"Could not reach Google Drive: ..."}`, the Mods view will show a red
  "Could not reach Google Drive — check backend configuration" banner with a link back to this guide — the error
  message in that response is the actual Google API error (missing key file, folder not shared, wrong folder ID, etc.).
