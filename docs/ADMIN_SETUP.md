# Admin Setup — Roles, Hosts, and the Admin Panel

ShinRacer's Phase 12 added a real permission system on top of Google
sign-in: every crew member is **Admin**, **Host**, or **Crew**, and every
route on the backend requires a valid signed-in Google account. This is a
one-time setup guide for William (the first admin) plus a reference for
day-to-day crew/host management afterward.

## 1. Google sign-in prerequisite

Roles sit on top of the same Google OAuth client the Mod Manager already
uses — if you haven't set that up yet, do
[docs/GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) first. Nothing below
works without `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` already
configured in `backend/.env` on shinobi.

## 2. `roles.json` — the permission source of truth

Roles live in `backend/config/roles.json` on shinobi — **not** in the
database, **not** in git (it's gitignored; only
`backend/config/roles.json.example` is committed). The backend watches this
file and reloads it live on any change — no restart needed after editing it
by hand.

Shape:

```json
{
  "admins": ["<your Google UID>"],
  "hosts": [],
  "crew": []
}
```

Anyone not listed in `admins` or `hosts` is treated as `crew` by default —
the `crew` array exists for completeness but nothing actually reads it as a
special case beyond "not admin, not host."

### Bootstrapping the first admin

The very first admin has to be added by hand, since there's no one with
permission to promote them yet:

1. Sign in to ShinRacer once (Electron or PWA) with the Google account that
   should be the first admin. It'll land on an "ACCESS RESTRICTED" screen
   for everything except Events/Comms/Stats/Mods/Links/Settings — expected,
   since it's crew by default until promoted.
2. Find that account's Google UID. Easiest path: on shinobi, check
   `backend/ac_companion.db`'s `users` table (every account that's ever
   signed in gets a row there) —
   ```bash
   sqlite3 /home/shinobi/ac-companion-backend/ac_companion.db \
     "SELECT uid, email, name FROM users;"
   ```
3. Copy `backend/config/roles.json.example` to
   `backend/config/roles.json` on shinobi (if it doesn't exist yet) and add
   that UID to the `admins` array:
   ```json
   { "admins": ["104xxxxxxxxxxxxxxxxxx"], "hosts": [], "crew": [] }
   ```
4. Save. No restart needed — the file watcher picks it up within moments.
   Sign out and back in (or wait for the app's periodic token re-check) and
   the Admin nav item appears.

After that, every further role change goes through the Admin panel (below)
instead of hand-editing the file — the panel writes to the exact same file,
it's just less error-prone than JSON by hand.

## 3. The Admin panel

Visible only to Admins, in the sidebar. Four sections:

- **Crew Management** — every Google account that has ever signed in, with a
  role dropdown per row. Changing a role there calls
  `PATCH /api/admin/users/:uid/role`, which updates `roles.json` **and** the
  `users` table's cached role column in one call — no separate step needed.
  Takes effect on that user's *next* request (role is re-derived from
  `roles.json` on every authenticated call, never cached client-side).
- **Host Status** — every machine ever registered as a host (via Settings'
  "Register as host" — see below), online/offline, last seen, with a
  **Remove** button. Removing a host just un-registers the machine; it
  doesn't touch that person's crew role.
- **Server Overview** — AC servers currently running **on this machine
  only**. This is a real, disclosed scope limit: there's no cross-machine
  server registry, so an admin checking this panel from a different PC than
  the one hosting won't see that server here. Check the Host Status table's
  online indicator for whether a given host machine is up at all.
- **System Health** — the backend process's own uptime/memory, plus a
  **Restart backend** button (with a confirm step) that runs
  `sudo systemctl restart ac-companion` on shinobi. Passwordless sudo for
  exactly that command is already configured on shinobi (see
  `scripts/deploy-backend.ps1`'s header comment) — restarting kills the
  request that triggered it, so the response is sent *before* the restart
  actually fires.

## 4. Becoming a Host

Only Admins can promote someone to Host (Crew Management dropdown). Once
promoted, that person registers their *machine* — a role and a host
registration are different things: the role says "you're allowed to host,"
the registration says "this specific PC is available for crew to pick when
proposing an event."

From **Settings → Host status** (visible once your role is Host or Admin):

1. Set your AC path if you haven't already (Settings → AC paths).
2. The readiness checklist runs automatically: AC installed, acServer.exe
   found, backend reachable, port 9600 free, registered as a host. Hit
   **Recheck** any time.
3. Click **Register as host** (or **Update host info** if already
   registered) once every check is green. This calls
   `POST /api/hosts/register` with your machine's hostname and AC path.
4. Your machine now appears in the "SHINOBI HOSTS" vs "I'LL HOST" selector
   crew members see when proposing an event — but **only Hosts and Admins
   ever see the "I'll host" option at all**; it's not rendered in the DOM
   for Crew, not just disabled, since letting a random crew PC volunteer to
   host without any readiness checking would be a real footgun.

## 5. Verifying it worked

- A brand-new Google account signs in and lands as Crew — Admin/Host-only
  nav items are simply absent from the sidebar (not shown-but-disabled).
- Directly navigating to a restricted view (if the route is somehow reached)
  shows the "ACCESS RESTRICTED" full-page gate, not a broken/empty view.
- Promoting that account to Host in the Admin panel, then having them
  sign out and back in, makes the "I'll host" option appear in the event
  proposal form and unlocks Settings' Host Status section.
- `GET /api/admin/system/health` (via the Admin panel, not curl — it
  requires the admin's bearer token) shows real uptime/memory, and Restart
  backend actually bounces the service (health goes briefly unreachable,
  then recovers within a few seconds).
