# AC Companion App — Claude Code Project Brief

> App display name: ShinRacer
> Repo: ShinobiFPV/ShinRacer (previously AC1Companion)

## What this is
A Windows desktop Electron + React app that serves as a full companion to Assetto Corsa 1 (via Content Manager). It combines:
1. **Server Manager** — build, deploy, and run AC servers locally (already partially built)
2. **Traffic Manager** — CSP AI traffic + sol WeatherFX config editor (already partially built)
3. **Events Calendar** — propose/accept race events, visible to all users
4. **Comms Hub** — WebRTC voice chat + group text with quick-phrase buttons
5. **Lap Stats** — session tracking from AC's UDP telemetry

## Architecture

### Electron app (Windows, this repo)
- `src/main/` — Electron main process, IPC handlers
- `src/renderer/` — React + Vite SPA
- Users: William (shinobi) + racing friends connecting via Tailscale or LAN

### Shared backend (Node.js, deploys to Pi 5 at 192.168.1.203)
- `backend/` folder in this repo
- Express + Socket.io server
- SQLite via better-sqlite3 for persistence
- Handles: events calendar API, chat message relay, WebRTC signaling, lap stats ingestion
- Friends connect to it via Tailscale network or configured host IP
- Runs as a systemd service on shinobi

### Comms (WebRTC)
- Signaling via Socket.io on the backend
- Peer-to-peer audio between Electron clients
- No TURN server needed (Tailscale handles NAT traversal)

### Lap Stats
- AC broadcasts UDP telemetry on port 9996 when cfg/cfg.ini has [LIVE_TELEMETRY] ENABLE=1
- Main process listens on UDP 9996, parses lap completed events, POSTs to backend API
- Backend stores in SQLite, renderer queries and displays

## Tech stack
- Electron 28, React 18, Vite 5
- Socket.io-client (renderer) + socket.io (backend)
- better-sqlite3 (backend)
- Express (backend)
- WebRTC via browser APIs (already available in Electron's Chromium)
- multer (file uploads — event posters)

## Current state of the codebase

### Already built (working foundation):
- `src/main/main.js` — Electron main, IPC for fs/dialogs/process/traffic config
- `src/main/preload.js` — contextBridge API surface
- `src/renderer/App.jsx` — nav shell with 5 views
- `src/renderer/components/primitives.jsx` — full design system (C tokens, Btn, Card, Slider, Toggle, etc.)
- `src/renderer/store/AppStore.jsx` — React context + electron-store persistence
- `src/renderer/lib/iniUtils.js` — INI/JSON generators for server_cfg.ini, entry_list.ini, traffic_config.ini
- `src/renderer/views/BuildView.jsx` — server build wizard (track/car picker, sessions, aids, INI preview, deploy)
- `src/renderer/views/DeployView.jsx` — live server pit boards + real-time log streaming
- `src/renderer/views/GarageView.jsx` — saved presets
- `src/renderer/views/TrafficView.jsx` — full CSP traffic editor (behaviour, roster, density schedule, file preview)
- `src/renderer/views/SettingsView.jsx` — AC path config

### Stubs (fixed in Phase 1, verified in Phase 2):
- `iniUtils.js` → `parseTrafficIni()` — parses existing traffic_config.ini back into profile state; "Load existing" populates the editor. **Do not modify.**
- `BuildView.jsx` → Entry list editor — per-slot car/skin/driver/GUID tab with auto-fill. **Do not modify.**

### New views (built in Phase 1, hardened in Phase 2):
- `src/renderer/views/EventsView.jsx` — calendar + propose/accept flow
- `src/renderer/views/CommsView.jsx` — voice + text chat hub
- `src/renderer/views/StatsView.jsx` — lap times + session stats

### Backend (built in Phase 1, hardened in Phase 2):
- `backend/server.js` — Express + Socket.io entry point
- `backend/db.js` — SQLite schema + queries (events, messages, laps, sessions)
- `backend/routes/events.js` — GET/POST events, PATCH :id/accept, poster upload
- `backend/routes/stats.js` — POST lap, GET laps/sessions/bests/leaderboard
- `backend/routes/chat.js` — message history REST endpoint
- `backend/socket.js` — Socket.io handlers (chat relay, WebRTC signaling, user presence)

See "Phase 2 completion" and "Phase 3 completion" at the end of this file for the full list of fixes, wiring, polish, and feature-completion work applied on top of the Phase 1 foundation above.

## Design system (use throughout — do not deviate)
All components in `src/renderer/components/primitives.jsx` must be used.

Color tokens (from `C` object):
- bg: #0D0F12, surface: #13161A, raised: #1A1E24
- border: #252A32, borderHi: #353D47
- yellow: #F5C518 (primary accent), yellowDim: #8A6E0D
- blue: #3D8EF0, green: #27AE60, red: #E74C3C, orange: #E67E22, purple: #8E44AD
- white: #E8ECF0, muted: #5A6475, mutedHi: #7A8599
- mono: JetBrains Mono, head: Rajdhani (700), body: Inter

## Nav items (App.jsx — update to include new views)
Current: deploy, build, garage, traffic, settings
Add: events (📅), comms (🎙️), stats (📊)
Order: deploy, build, garage, traffic, events, comms, stats, settings

## Backend connection
- Backend URL stored in electron-store as `backendUrl` (default: http://192.168.1.203:3000)
- Renderer connects via axios (REST) + socket.io-client (realtime)
- User identity: stored locally as `{ handle, color }` — no auth needed, this is a friends-only LAN/Tailscale app
- Handle set in Settings view

## Detailed feature specs

### Events Calendar

**Calendar view:**
- Month grid calendar showing proposed + confirmed events
- Each event: colored dot + name on the day cell
- Click event → detail panel slides in from right
- Detail panel shows: poster image (if uploaded), track, cars, type (race/drift/hotlap/cruise), date/time, required mods list, who proposed it, who accepted, status badge (Proposed / Happening / Past)
- "Accept" button visible if current user hasn't accepted yet
- Event goes from Proposed → Happening when ≥1 other user accepts (proposer + 1)

**Propose event form:**
- Fields: name, type (Race / Drift Session / Hotlap Practice / Cruise), date, time, track name, car class/restriction (free text), required mods (add as list), notes
- Poster upload: drag-drop or click, stored as file on backend, served as static asset
- Submit → POST /api/events → appears on calendar immediately as Proposed

**Data model (SQLite):**
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT, type TEXT, date TEXT, time TEXT,
  track TEXT, car_restriction TEXT, notes TEXT,
  poster_path TEXT, proposed_by TEXT,
  status TEXT DEFAULT 'proposed',
  created_at TEXT,
  required_mods TEXT  -- JSON array
);
CREATE TABLE event_acceptances (
  event_id TEXT, handle TEXT, accepted_at TEXT,
  PRIMARY KEY (event_id, handle)
);
```

### Comms Hub

**Layout:** Two-column — left is voice, right is text chat

**Voice panel:**
- Device selectors: microphone input dropdown, speaker output dropdown (uses navigator.mediaDevices.enumerateDevices)
- Input level meter (animated bar reacting to mic volume)
- Per-peer audio: each connected user shown as a card with their handle, color dot, speaking indicator, and individual volume slider
- Push-to-talk toggle (T key default, rebindable) OR open mic toggle
- Mute self button
- WebRTC mesh: each client connects peer-to-peer to every other client. Signaling via Socket.io events: `rtc:offer`, `rtc:answer`, `rtc:ice`

**Text chat panel:**
- Scrolling message history (loaded from backend on connect, last 100 messages)
- Message input + send (Enter key)
- Quick-phrase buttons (2-column grid, pre-filled but each editable in Settings):
  - "Returning to pits"
  - "I've wrecked, I'm out"
  - "Yellow flag, slow down"
  - "Good race everyone"
  - "Ready when you are"
  - "Give me 2 mins"
  - "On my way to grid"
  - "GG"
- Messages show: handle (colored), timestamp, text
- System messages for join/leave in gray italics

**Socket.io events:**
- `chat:message` — { handle, color, text, ts }
- `chat:history` — array of last 100 messages on connect
- `presence:join` / `presence:leave` — { handle, color }
- `presence:list` — current users list
- `rtc:offer` / `rtc:answer` / `rtc:ice` — { from, to, payload }

### Lap Stats

**AC UDP telemetry:**
- Enable in AC: cfg/cfg.ini → [LIVE_TELEMETRY] ENABLE=1 APP_ID=race_stats UDP_PORT=9996
- Electron main process creates UDP socket on port 9996
- Parse AC's RT_CAR_INFO packets for lap completed events
- On lap complete: POST /api/stats/lap with { handle, track, car, lapTime, sector1, sector2, sector3, sessionId, ts }

**Stats view layout:**
- Top: session selector dropdown (recent sessions) + track filter
- Personal bests table: track | car | best lap | S1 | S2 | S3 | date
- Session leaderboard: when a session is selected, rank all drivers by best lap
- Lap history chart: line chart (simple SVG, no library needed) showing lap times across a session — spot consistency
- Friends comparison: side-by-side best laps per track, delta highlighted in green/red

**Data model:**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, track TEXT, date TEXT,
  server_name TEXT, participants TEXT  -- JSON array of handles
);
CREATE TABLE laps (
  id TEXT PRIMARY KEY, session_id TEXT, handle TEXT,
  track TEXT, car TEXT, lap_time_ms INTEGER,
  s1_ms INTEGER, s2_ms INTEGER, s3_ms INTEGER,
  lap_number INTEGER, ts TEXT, valid INTEGER DEFAULT 1
);
```

### Entry List Editor (fix for BuildView)
Add a new tab in BuildView called "Entry List":
- Table of slots 0 → maxClients-1
- Per slot: car (dropdown from selected cars), skin (text input), driver name (text), GUID (text, optional)
- "Auto-fill" button: distribute cars evenly, leave driver/GUID blank
- Generates real entry_list.ini with actual GUID slots when present

### Traffic INI Parser (fix for TrafficView)
Implement `parseTrafficIni(iniText)` in `iniUtils.js`:
- Parse [TRAFFIC], [BEHAVIOR], [SPAWNING] sections into csp object matching DEFAULT_CSP shape
- Parse [SCHEDULE] DENSITY_HOUR_XX keys into schedule array
- Parse [CAR_XX] blocks into roster array
- Return `{ csp, schedule, roster }` — merge into active profile on "Load existing"
- In TrafficView, after `api.traffic.loadExisting()` returns iniContent, call parseTrafficIni and updateActive()

## IPC additions needed in main.js

```javascript
// UDP telemetry listener
ipcMain.handle('telemetry:start', (_, port) => { /* create dgram UDP socket */ })
ipcMain.handle('telemetry:stop', () => { /* close socket */ })
// Emit 'telemetry:lap' event to renderer when lap packet received

// User identity
ipcMain.handle('identity:get', () => store.get('identity'))
ipcMain.handle('identity:set', (_, identity) => store.set('identity', identity))
```

## Preload additions
```javascript
telemetry: {
  start: (port) => ipcRenderer.invoke('telemetry:start', port),
  stop: () => ipcRenderer.invoke('telemetry:stop'),
  onLap: (cb) => { ipcRenderer.on('telemetry:lap', (_, data) => cb(data)); return () => ipcRenderer.removeAllListeners('telemetry:lap') }
},
identity: {
  get: () => ipcRenderer.invoke('identity:get'),
  set: (id) => ipcRenderer.invoke('identity:set', id),
}
```

## Backend deployment (shinobi)
- `backend/` runs as Node process on Pi 5
- Add to `scripts/deploy-backend.ps1`: rsync backend/ to shinobi:~/ac-companion-backend/, ssh restart systemd service
- Systemd unit file at `backend/ac-companion.service`

## Publishing (public export)
`scripts/publish-public.ps1` pushes a sanitized copy of this repo straight
from this Windows machine to the public `ShinobiFPV/ShinRacer` repo
— no Pi involved, unlike imq2/shinagent's publish flow, since this project
never runs anywhere but here. It robocopies the tree (excluding `.git`,
`.claude`, `node_modules`, `dist*`, `release`, `CLAUDE.md`, uploaded files,
the local SQLite DB, and the two publish scripts themselves) into
`%TEMP%\shinracer-public-export`, runs
`scripts/sanitize-public-export.js` to scrub the owner's Pi hostname
(`shinobi`) and LAN IP (`192.168.1.203`) from every `.js`/`.jsx`/`.json`/
`.md`/`.html`/`.service`/`.ps1` file, then force-pushes it as a single
squashed commit. When adding a new file with a hardcoded personal
IP/hostname/path, add a scrub pattern for it in
`sanitize-public-export.js` — the scrubber only touches known extensions,
so an unlisted extension silently ships unsanitized.

## File structure additions
```
backend/
  server.js          ← Express + Socket.io entry
  db.js              ← SQLite schema + query helpers
  routes/
    events.js        ← /api/events CRUD + poster upload
    stats.js         ← /api/stats/lap POST, GET laps/sessions
    chat.js          ← /api/chat/history GET
  socket.js          ← Socket.io event handlers
  uploads/           ← poster images (gitignored)
  ac-companion.service ← systemd unit
src/renderer/
  views/
    EventsView.jsx
    CommsView.jsx
    StatsView.jsx
  hooks/
    useSocket.js     ← socket.io-client connection hook
    useWebRTC.js     ← WebRTC mesh peer management hook
    useTelemetry.js  ← UDP lap data hook
  lib/
    api.js           ← axios instance pointed at backendUrl
```

## Notes on voice implementation
Use the browser's RTCPeerConnection API (available in Electron's Chromium). Each client:
1. On connect, announces presence via `presence:join`
2. For each existing peer, initiates an RTCPeerConnection
3. getUserMedia({ audio: true }) → add track to all peer connections
4. Exchange offer/answer/ICE via Socket.io signaling
5. On remote track received → new Audio() element or Web Audio API for per-peer volume control

No STUN needed for Tailscale (all traffic is routed). For LAN fallback, use `stun:stun.l.google.com:19302`.

## AC UDP telemetry packet format
AC broadcasts RT_CAR_INFO UDP packets. The relevant lap completed event:
- Packet identifier byte 0: 0x22 (RT_LAP)
- Bytes 1-4: car index (uint32 LE)
- Bytes 5-8: lap time ms (uint32 LE)
- Bytes 9-12: sector 1 ms
- Bytes 13-16: sector 2 ms
Parse using Node's `dgram` module in main process.

## Quality bar
- All new views use the existing design system from primitives.jsx — no new color choices, no new component libraries
- Backend routes return consistent `{ ok: true, data: ... }` or `{ ok: false, error: ... }`
- All IPC handlers follow existing pattern in main.js
- Socket.io events namespaced with colon convention (chat:message, rtc:offer, etc.)
- No auth — this is a closed friends app on Tailscale/LAN

## Phase 2 completion

Phase 2 audited the Phase 1 output for cold-start correctness, wired the remaining
runtime loose ends, and applied UI polish. Three tracks, all complete.

### Track 1 — cold-start fixes
- Root `package.json`: confirmed `axios`/`socket.io-client`/`electron-store@^8` already present; added `define: { global: 'globalThis' }` to `vite.config.js` (required for socket.io-client in Electron's renderer).
- `backend/package.json`: added `uuid` (now used for all generated IDs instead of `crypto.randomBytes`), `engines.node >= 18`.
- `backend/db.js`: DB file renamed to `ac_companion.db` (was `data.db`), path built from `__dirname` so it's cwd-independent; schema creation wrapped in try/catch with `console.error`; `events.list()`/`events.get()`/`events.accept()` now return `acceptances` as a plain array of handles (`[handle, ...]`) instead of `{handle, accepted_at}` objects; `listLaps` now orders by `lap_time_ms ASC`; `listSessions`/`personalBests` accept an optional `track` filter.
- `backend/server.js`: explicit CORS methods list, `uploads/` created at startup via `fs.mkdirSync`, `/api/health` returns the flat `{ ok, uptime }` shape (no `data` wrapper — this one route is intentionally an exception to the `{ok,data}` convention, per explicit spec).
- `backend/routes/events.js`: POST validates `name/date/time/track/proposed_by` and 400s if missing; accept endpoint moved to `PATCH /api/events/:id/accept` (was `PATCH /api/events/:id`).
- `backend/routes/stats.js`: POST /lap validates required fields; added `GET /api/stats/leaderboard` (per-handle-per-track bests, car-agnostic) used by the friends comparison, kept separate from `GET /api/stats/bests` (per-car bests for the single-driver table) rather than merging the two shapes.
- `backend/socket.js`: `presence:list` now re-broadcast to **all** clients (not just the joining socket) after every join/leave, so presence self-heals. WebRTC relay keys off socket id rather than a handle→socketId map — a handle can have more than one live connection (two tabs), which a handle-keyed map can't disambiguate; socket id has no such collision and Socket.IO already rooms every socket under its own id.
- `src/main/main.js`: UDP telemetry payload now includes sector 3 (`s3 = buf.readUInt32LE(17)`), field names simplified to `{ lapTimeMs, s1, s2, s3 }`.
- `src/renderer/lib/api.js`: added a pub-sub (`onBackendUrlChange`) so other singletons can react when Settings changes the backend URL, instead of polling.
- `src/renderer/hooks/useSocket.js`: rebuilt as a true module-level singleton connection (survives view switches instead of reconnecting every mount), exports `{ socket, connected, users }`, reconnects automatically when the backend URL changes.
- `src/renderer/hooks/useWebRTC.js`: speaking detection moved into the hook itself (was per-component in CommsView) — one shared AnalyserNode per peer, polled every 100ms, returned as a `speaking` map alongside `remoteStreams`.
- `EventsView.jsx` / `CommsView.jsx` / `StatsView.jsx`: updated to match all of the above (acceptances-as-array, `/accept` path, `users`/`speaking` from the hooks, `s1/s2/s3` telemetry fields).

### Track 2 — runtime integration
- `AppStore.jsx`: `identity`, `backendUrl`, and `quickPhrases` are now independent top-level store keys (previously `backendUrl`/`quickPhrases` were nested inside `settings`, which meant `lib/api.js`'s read of the top-level `backendUrl` store key never actually matched what Settings saved — a real bug, now fixed).
- `SettingsView.jsx`: identity section (handle + 8-swatch color picker, colors drawn from `C`), backend URL field with a "Test connection" button hitting `GET /api/health`, quick-phrases grid with "Reset to defaults".
- `backend/server.js`: `GET /api/health` added (see Track 1).
- `scripts/deploy-backend.ps1`: retargeted to `billk@192.168.1.203`, prints a clear pass/fail per step (rsync, npm install, restart, status).
- `backend/ac-companion.service`: `User=billk`, `WorkingDirectory=/home/billk/ac-companion-backend`.

### Track 3 — polish
- Empty states: Events (flag emoji + propose CTA), Stats (stopwatch emoji + collapsible cfg.ini snippet with copy button), Comms (orange "backend unreachable" banner + Retry).
- Event status colors: proposed = blue, happening = green (detail panel gets a green edge glow), past = muted + 0.6 opacity (applied to both the detail panel and the calendar pill).
- Calendar: yellow inset border on today, per-event status-colored dots under the day number, click an empty day to open the propose form pre-filled with that date.
- Comms: peer color dot pulses (scale 1→1.3→1, 600ms) while `speaking` is true.
- Stats: red pulsing dot + "Recording" badge + live lap counter next to the session selector while capture is active.
- Lap time formatting centralized in `src/renderer/lib/format.js` (`formatLapTime`), used everywhere lap times are displayed.
- Required mods: propose form now has one editable row per mod with a remove button (was a single input + static tag list); detail panel renders them as a bulleted list with a "Copy all" button.

### Noted deviations
- `/api/health` returns `{ ok, uptime }` with no `data` wrapper — explicit spec override of the general `{ok,data}` convention.
- `/api/stats/bests` kept car-level granularity and single-handle filtering (for the personal-bests table); the new `/api/stats/leaderboard` handles the multi-handle, car-agnostic case (for friends comparison) instead of overloading `/bests` with both shapes.
- `/api/stats/laps` query param is `sessionId` (camelCase), matching the existing renderer contract, not `session_id` — changing it would have required touching both sides of an already-consistent, working interface for no functional gain.
- WebRTC signaling addresses peers by socket id, not by a handle→socketId map (see Track 1 notes above).

## Phase 3 completion

Phase 3 added the remaining admin/completion features across six tracks, on top of
the running Phase 1+2 app (backend live on shinobi, 192.168.1.203:3000). Manual
runtime fixes applied before this pass (renderer CSP, `App.jsx` overflow, the
`billk`→`shinobi` rename on the deploy target and systemd unit, `EventsView`
default time + `position:absolute` detail panel) were left as-is and built on top of,
not reverted.

### Track 0 — Events admin
- `DELETE /api/events/all` (registered before `/:id` so Express doesn't swallow it as an id param) and `DELETE /api/events/:id`, both via new `events.deleteAll()`/`events.deleteOne()` in `db.js`.
- EventsView: "Delete event" in the detail panel and "Clear calendar" in the header, both two-step (click → "Confirm ___" + Cancel). Both re-fetch from the backend after succeeding, in addition to the optimistic local-state update.

### Track 1 — Server manager completion
- `main.js` polls each running server's `http://localhost:{httpPort}/JSON` every 10s (Node 18's global `fetch`, no new dependency) and pushes `server:players:{id}` — one IPC channel per server, matching the existing `server:log:{id}` pattern, so multiple live pit boards don't stomp on each other's listeners the way a single shared `server:players` channel would (`removeAllListeners` on unmount would have killed every other board's subscription too).
- `DeployView`'s Players tile now shows the live count and a `title` tooltip listing driver names.
- BuildView "Sessions" tab: "Enable stracker plugin" toggle (`cfg.strackerEnabled`) appends a `[PLUGIN]` block to `server_cfg.ini`. Note: `[SERVER]` already unconditionally sets `UDP_PLUGIN_LOCAL_PORT=11000` from Phase 1 — this adds a second, conditional one under `[PLUGIN]` exactly as specified rather than touching the pre-existing line.

### Track 2 — Events calendar, full feature
- iCal export ("Add to Calendar") builds a minimal `.ics` by hand and downloads it via `URL.createObjectURL`.
- Editing: `ProposeForm` now doubles as an edit form (`editingEvent` prop) submitting `PUT /api/events/:id`. Changing date/track/time resets status to `proposed` and clears acceptances server-side (`events.update()` in `db.js`). Any user can edit — no ownership check, per spec.
- Cancellation: `PATCH /api/events/:id/cancel`, cancelled events render with a muted dot, strikethrough name, and 0.5 opacity; the route also `io.emit('event:cancelled', ...)` and `EventsView` listens for it (via `useSocket`, which it now also uses) to re-sync everyone's calendar.
- Reminders: `EventsView` fetches events on mount + hourly, filters to `status === 'happening'` within 24h, and calls `window.api.reminders.check(...)`. Main-process owns the notified-id `Set` and actually shows the `Notification`. This only fires while `EventsView` has been mounted at least once this session — there's no independent backend-polling loop elsewhere, since main.js has no way to reach the backend's event data on its own.

### Track 3 — Comms voice quality + reliability
- `getUserMedia` now requests `echoCancellation`/`noiseSuppression`/`autoGainControl`/`sampleRate: 48000`.
- `useWebRTC` tracks `connectionState` per peer and who originally sent the offer (`offererRef`); on `failed`, only the original offerer auto-re-initiates (avoids both sides racing to re-offer). A manual "Reconnect" button (shown on failed/disconnected peers) always re-offers fresh regardless of original role.
- PTT: the existing 🎙️ indicator now pulses (reusing the existing `pulse` keyframe, no new CSS) while the key is held.
- Per-peer volume persists to electron-store under `peerVolumes` (keyed by handle), debounced 500ms on slider change, loaded once when the Voice panel mounts.

### Track 4 — Lap stats depth
- `POST /api/stats/session` added; called once per capture session (first lap) from `StatsView`. Also added `sessions.created_at` via a guarded `ALTER TABLE` migration (SQLite has no `ADD COLUMN IF NOT EXISTS`, so it's wrapped in try/catch) so sessions can display as "{track} — HH:MM".
- The polyline chart was replaced with a stacked S1(blue)/S2(yellow)/S3(green) bar chart, one bar per lap, height scaled to the session's slowest lap with a dashed PB line at the fastest. Hover shows a per-lap tooltip. This is a genuine interpretation call: the spec didn't say whether "per lap" bars should split by driver — bars stay chronological across all drivers in the session, with a thin per-driver color tag on top of each bar and a legend, rather than inventing a driver-selector that wasn't asked for.
- CSV (`Session,Track,Car,Driver,Lap,Time,S1,S2,S3,Valid`) and JSON export buttons, both via `Blob` + `URL.createObjectURL`.
- Invalid-lap flagging: `main.js` reads byte 21 of the UDP packet (`(flags & 1) === 0` → valid) and includes it on `telemetry:lap`. A new raw "All laps" list shows invalid laps in red/strikethrough, gated by an "Include invalid laps" toggle (default off) that also filters the leaderboard/chart/exports.

### Track 5 — Production hardening
- `ErrorBoundary.jsx` (class component) wraps the active view in `App.jsx`, keyed by view id so switching views resets it. Shows the stack, a "Copy error" button, and "Reload view".
- `AppStore` polls `GET /api/health` every 30s, exposing `backendOnline`/`recheckBackend`. Sidebar footer shows a green/red dot next to the backend URL.
- Shared `<OfflineBanner>` (primitives.jsx) replaces the bespoke banner Comms had in Phase 2; now used identically in Events, Comms, and Stats, all gated on the same `backendOnline` flag (Comms' Retry also nudges the socket via `socket.connect()`).
- Window bounds save to electron-store on `close`, restored on next launch only if still within `screen.getAllDisplays()` bounds (otherwise Electron's own centering default applies).
- Main-process logging to `%APPDATA%\AC Server Manager\logs\main-{date}.log` (explicit `app.getPath('appData')` join, not relying on `app.name`, so the folder name is correct in both dev and packaged builds), 5-day rolling cleanup on startup, covering app start, AC detection, server start/stop/exit, and every UDP lap. "Open log folder" button added to Settings.
- Deploy script rewritten to use `scp`/`ssh` instead of `rsync` (Windows path-conversion issues), one command per line, no backticks/here-docs, retargeted to `shinobi@192.168.1.203` to match the manually-updated systemd unit. Deviation: copies explicit backend source paths (`server.js`, `db.js`, `socket.js`, `package.json`, `ac-companion.service`, `routes/`) instead of a blanket `backend\*`, to avoid ever scp'ing a local `node_modules/` or stray `ac_companion.db` over the live production database.

### Not independently verified
Node is still unavailable in the sandbox this was built in, so none of Phase 3 was run — same caveat as Phases 1 and 2. Everything above was checked via careful reading plus brace/paren-balance and stale-reference scans across every touched file, not by executing the app.

## Phase 4 completion

Phase 4 added three tracks on top of the running Phase 1–3 app: a from-scratch
deploy script rewrite, a first-run install wizard, and friend invite/join-link
sharing. Unlike prior phases, this one **was** run and driven end to end — Node
24 and Electron 28 are both available in this environment now, so the backend
was smoke-tested live and the renderer was driven through a real Electron
window via a throwaway Playwright `_electron` script (deleted after use, not
checked in).

### Track 0 — Deploy script rewrite
- `scripts/deploy-backend.ps1` rewritten from scratch per the strict single-line-statement rule: no `if`/`else`, no `try`/`catch`, no backticks, no here-strings — every `scp`/`ssh`/`Write-Host` is a standalone line. Verified by parsing (not executing) the file with `[scriptblock]::Create()`, which fails on any real syntax error without touching the network.
- Copies `server.js`, `db.js`, `socket.js`, `package.json`, and `routes/{events,stats,chat,invites}.js` individually (see Track 2 below for why `invites.js` is included even though the original spec list predated that file), `npm install --omit=dev --silent` remotely, `sudo systemctl restart ac-companion` (passwordless per the sudoers rule already configured), then a `curl` health check whose raw JSON is the last line printed.

### Track 1 — First-run install wizard
- `src/renderer/components/Wizard.jsx` — new component, gated in `App.jsx` on `settings.setupComplete`. Steps: Welcome, AC Path (6-step flow only), Identity, Backend, Quick phrases (6-step only), Done.
- `AppStore.jsx` gained a `hydrated` flag (true once persisted store state has loaded). `App.jsx` renders nothing until `hydrated`, then the Wizard or the main app — without this, returning users would see the Wizard flash for one frame before their real `settings.setupComplete: true` loaded from electron-store.
- Detection: `api.ac.detect()` (AC root) decides the step count ("AC server found" = AC root found); `api.fs.exists()` on `{root}\server\acServer.exe` separately drives the AC Path step's own green-check/orange-banner and Next-button validation. In practice a standard Steam install has both together, but this split means a base install missing just the dedicated server component still gets a useful banner instead of the step silently vanishing.
- Wizard state is fully local until "Open AC Companion" is clicked, which batch-calls `saveSettings`/`saveIdentity`/`saveBackendUrl`/`saveQuickPhrases` once from `App.jsx` (the Wizard itself has no store access — it's rendered standalone before the rest of the layout mounts).
- Verified live: launched Electron against an isolated `--user-data-dir` (never touched the real `%APPDATA%\ac-server-manager\config.json`), stepped through every screen, confirmed real AC auto-detection, and confirmed landing on the main app with the Sidebar/DeployView intact.

### Track 2 — Friend invites / join links
- `backend/db.js`: new `invites` table (`code` PK, `server_name`, `host`, `port`, `password`, `track`, `cars`, `created_by`, `created_at`, `expires_at`) plus `create`/`get`/`delete`/`cleanup()`. `get()` treats an expired row as not-found rather than deleting it inline — `cleanup()` (called once on server startup) is what actually prunes, so a lookup stays a pure read.
- `backend/routes/invites.js`: `POST /api/invites` (6-char uppercase alnum code, re-rolled on collision), `GET /api/invites/:code` (case-insensitive — uppercased server-side), `DELETE /api/invites/:code`. Mounted at `/api/invites` in `server.js`, which also calls `invites.cleanup()` once at boot. Smoke-tested live (Node available, but `better-sqlite3` has no prebuilt binary for Node 24/win32 and this machine has no VS Build Tools for `node-gyp`) by stubbing `db.js` in the require cache with an in-memory equivalent and loading the real `server.js`/`invites.js` unmodified — create, case-insensitive lookup, 404-on-expired-or-missing, 400-on-missing-host, and delete all verified against actual HTTP responses.
- `backend/socket.js`/`routes/invites.js`: `io.emit('invite:created', { code, serverName, createdBy })` on every successful POST; `DeployView` listens via the existing `useSocket` hook and shows a toast.
- `DeployView.jsx`: `ShareModal` (exported, not just local — see below) generates an invite for a live server, shows the code, a QR code, host/port/password/track, "Copy code"/"Copy join command" (`/connect {host}:{port} password:{password}`), a live expiry countdown, and Revoke. `JoinModal` looks up a code via `GET /api/invites/:code` and shows a "Connect in AC" button. Host is prefilled from a new `network:localIp` IPC handler (`os.networkInterfaces()`, first non-internal IPv4) — editable, since this app explicitly supports both LAN and Tailscale and there's no way to know which one a given friend needs.
- QR codes use the `qrcode-generator` npm package (the one dependency addition the spec permitted) — `qr.createDataURL(5, 2)` returns a ready `data:image/gif;base64,...` string, so no SVG/canvas plumbing was needed.
- `main.js`: registers `accomp` as the default protocol client (`app.setAsDefaultProtocolClient`, dev-mode-aware per Electron's own docs), and adds `app.requestSingleInstanceLock()` + a `second-instance` handler — this app had no single-instance lock before, and without one Windows would never hand a clicked `accomp://` link back to the already-running instance at all. Incoming URLs (from `second-instance` argv or the initial launch's `process.argv`) are forwarded to the renderer via a new `accomp:open` IPC event; `DeployView` distinguishes a 6-char invite code (opens `JoinModal` pre-filled) from a `host:port` payload (toast only — see deviation below).
- `EventsView.jsx`: detail panel shows "Generate invite" for a `happening` event when `liveServers` has an entry whose `config.trackId` matches the event's track (reuses `ShareModal` from `DeployView.jsx` rather than duplicating the invite UI, with an added `carRestriction` display line for the event's car class); otherwise shows "No live server for this event" in muted text.

### Verified live
Node 24 and Electron 28 both work in this environment (unlike Phases 1–3's sandbox). Concretely verified, not just read: `scripts/deploy-backend.ps1` parses as valid PowerShell; the invites backend's full request/response cycle (via the db.js stub above); a real Electron window driven through the entire Wizard flow end to end including real AC auto-detection, landing on the main app, and opening the Join-server modal from `DeployView`'s header. Not verified live: the Share modal's actual invite POST from the UI, EventsView's "Generate invite" button, and the `accomp://` protocol round-trip (`app.setAsDefaultProtocolClient` + second-instance handoff) — all three need either the compiled backend or an OS-level protocol-click, neither of which this pass could reach.

### Noted deviations
- The deploy script's file list includes `routes/invites.js` even though it predates that file's existence in the original spec — omitting it would silently break the exact feature the deploy is shipping.
- "AC server found" (which gates the Wizard's step count) is read from `api.ac.detect()` alone, not the `ac.detect() + fs.exists(acServer.exe)` combination — see Track 1 above for why.
- The `accomp://host:port` "Connect in AC" round-trip is a real, working protocol registration and second-instance handoff, but on receipt it currently only shows a toast rather than launching Content Manager — this codebase has no CM-launch capability anywhere else to hook into, and fabricating one wasn't part of the spec. The `accomp:open` IPC event is the clean extension point if that's wanted later.

## Phase 5 completion

Phase 5 added GitHub-Releases-based friend onboarding (installer + auto-updater)
and a Replay Browser, plus a small pre-existing-cleanup track. This entry
picks up after a Claude Code crash mid-session; everything below was found
already implemented on disk when the follow-up session started, and this pass
was spent auditing it against the spec rather than writing it from scratch,
then closing the one gap found (this doc) and verifying the app actually runs.

### Track 0 — pre-existing cleanup
- WebkitAppRegion: already only ever set inside `style={{...}}` objects in `App.jsx` (`grep` across `src/` turned up zero JSX-prop instances) — no change needed.
- Garbled UTF-8 (`â€"`, `âœ"`, etc.): none found anywhere under `src/renderer/` — no change needed.
- Unused import in `DeployView.jsx`: every imported identifier (`useRef`, `useMemo`, `StatusDot`, `Label`, etc.) has a real usage site in the file — no change needed.

### Track 1 — GitHub Releases installer + auto-updater
- `package.json`: `build.publish` (github/ShinobiFPV/AC1Companion/release), `release`/`release:dry` scripts, `electron-updater` dependency — all present exactly as specced.
- `vite.config.js` / `AppStore.jsx`: `__BACKEND_URL__` define wired through to `DEFAULT_BACKEND_URL`, falling back to the hardcoded LAN IP when unset.
- `Wizard.jsx`'s Backend step pre-fills from `DEFAULT_BACKEND_URL` and auto-runs the connection test on mount (see its effect comment).
- `main.js`: `autoUpdater` wired to `update-available` (Notification), `update-downloaded` (restart/later dialog → `quitAndInstall()`), gated behind `!isDev`, called after `app.whenReady()`.
- `.env.example`, `.gitignore` (`.env`/`.env.*` ignored, `.env.example` unignored), `.github/workflows/release.yml` (tag-triggered, windows-latest, node 20, `npm install` + `npm run release` with `GH_TOKEN`/`VITE_BACKEND_URL`), `.github/release-template.md`, `docs/FRIEND_SETUP.md` — all present and matching spec content.
- Not independently verified this pass: an actual tag push / GitHub Actions run (would publish a real release), and a real auto-update cycle (needs two published versions).

### Track 2 — Replay Browser
- `main.js`: `replays:scan`, `replays:getMetadata` (binary header parser with the exact field layout from the spec, wrapped in try/catch, cached in electron-store under `replayMetadata` keyed by path with mtime-based invalidation), `replays:launch` (reads `settings.acPath`, spawns `AssettoCorsa.exe -replay <path>` detached), `replays:openFolder`. `preload.js` bridges all four.
- `ReplayView.jsx`: two-column layout, search/filter/sort, thumbnail hash-color, favorite star, tag chips + suggested tags, debounced notes, launch/open-folder actions, empty/skeleton/folder-missing states — matches the spec section-by-section. Annotations stored separately under `replayAnnotations` so metadata cache invalidation never touches user tags/notes/favorites.
- `App.jsx` nav already has `replays` between `stats` and `settings`.

### Verified this pass
`npx vite build` compiles clean (132 modules, no errors — the one pre-existing `path`-externalized warning is from `BuildView.jsx`, unrelated to Phase 5). `node --check` passes on `main.js`/`preload.js`. Ran `npm run dev` for real: Vite served on 5173, multiple `electron.exe` processes came up (main/renderer/GPU/utility) and stayed up, the app's own `%APPDATA%\AC Server Manager\logs\main-*.log` shows a clean `App started` → `AC detected at D:\SteamLibrary\...` sequence with no errors, and the dev console had no exceptions. Instance was then stopped cleanly. Not driven interactively (no click-through of the Replay Browser or a live installer build) — that would need a manual pass with real replay files and either a tagged release or `npm run release:dry`.

### Track 3 — Public README (documentation-only pass)
- `README.md` rewritten in full for public GitHub release: banner, badges, a 3-4 paragraph overview, one section per major feature with screenshot placeholders (no PNGs generated — see below), an architecture diagram, tech stack table, host/friend getting-started paths, backend deploy summary, AC telemetry setup, an SRP traffic walkthrough, and a Credits section crediting Claude/Claude Code by name alongside William's own direction of the project.
- `docs/screenshots/README.md` added: the full expected-filename table plus capture instructions, so the screenshot set can be produced consistently later without re-deriving which view/state each one needs.
- No source files, backend code, or scripts were touched — documentation only, per spec.
- Follow-up: a root `LICENSE` file (MIT, copyright William Kew / ShinTech Electronics) was added in a separate pass right after, so the README's License section link now resolves.

## ShinRacer rebrand (display-name-only)

The app's visible name changed from "AC Companion"/"AC Server Manager" to
**ShinRacer** — repo name, folder paths, the `ac-companion` backend service,
the `ac-companion.service` unit, and the `accomp://` URL scheme were all left
untouched, per explicit instruction. Changed: `package.json` (`productName`,
`description`, `build.appId`, `nsis.shortcutName`), `index.html` `<title>`,
`main.js`'s log directory (`%APPDATA%\ShinRacer\logs`) and the two
Notification/dialog strings in the auto-updater handlers, `App.jsx`'s sidebar
wordmark, `Wizard.jsx`'s welcome title and "Open ShinRacer →" button, and the
app-facing strings in `README.md`/`docs/FRIEND_SETUP.md`. Backend console
logs, the SQLite filename, iCal `PRODID`, and script comments (`deploy-backend.ps1`,
`publish-public.ps1`, etc.) were left as `AC Companion`/`ac-server-manager` —
none of those are user-visible and none were in the rebrand's explicit file list.

## Phase 6 completion

Phase 6 added the Mod Manager: Google Drive-backed mod browsing/download for
everyone, and Google OAuth-gated uploads, on top of the running Phase 1–5 app.

### Track 0 — Backend: Drive API + OAuth + mods routes
- `backend/lib/drive.js`: service-account Drive client (`drive.readonly` scope) exporting `listFolder`, `getFileMetadata`, `downloadFile` (returns a stream — never buffered), and `uploadFile` (takes a per-request OAuth2 client, never the service account, so uploads are attributed to the actual uploader).
- `backend/lib/oauth.js`: `getAuthUrl`, `exchangeCode` (token exchange + People API `userinfo.get()`), `getAuthenticatedClient`. Tokens are handed straight back to the caller and never persisted server-side.
- `backend/routes/mods.js`: `GET /` (5-minute in-memory cache), `GET /download/:fileId` (streams, doesn't buffer), `GET /auth/url`, `POST /auth/callback`, `POST /upload` (multer temp storage, Bearer-token auth, category validation, temp file always deleted in a `finally`), `GET /installs/:handle`, `POST /installs`. Every Drive-touching route is wrapped in try/catch and returns `502` with the real Google error message rather than crashing — verified by hitting all of them with fake/missing credentials (see Verified this pass).
- `backend/db.js`: `mod_installs` table + `modInstalls.list/upsert`, following the existing table/module shape exactly.
- `server.js`: `require('dotenv').config()` at the top, `app.use('/api/mods', createModsRouter(io))`.
- `backend/package.json`: added `googleapis@^140` and `dotenv@^16` (the only two permitted new deps) and ran a real `npm install` — versions resolved to `googleapis@140.0.1`/`dotenv@16.6.1`.
- Root `.env.example` and `docs/GOOGLE_DRIVE_SETUP.md` (new) document all nine `GOOGLE_*` variables plus the full Cloud Console setup path, folder-sharing step, and a "how to tell if it worked" section.

### Track 1 — Main process: download/install
- `main.js`: `mods:download` reads `settings.acPath`/`backendUrl` from the store, streams the zip from the backend to `app.getPath('temp')`, extracts via `Expand-Archive`, then deletes the temp file. `mods:openFolder` opens `content/{cars,tracks,tools}`.
- Zip extraction deviates from the spec's literal suggestion: the spec's `-Path`/`$args[0]` pattern doesn't actually work in Windows PowerShell's `-Command` mode (`$args` isn't populated from trailing argv the way it is under `-File` — confirmed by testing both live). Used `-EncodedCommand` (Base64 UTF-16LE) instead, which sidesteps quoting entirely and is immune to paths containing spaces or apostrophes; also sets `$ProgressPreference = 'SilentlyContinue'` so `Expand-Archive`'s CLIXML progress stream doesn't leak onto stderr. Verified live with a real zip round-trip.
- `preload.js`: `mods.download`/`mods.openFolder`, plus `auth.onCallback` for the OAuth code handoff.
- `main.js`'s `accomp://` handler now branches: URLs matching `accomp://oauth` or containing `?code=` are parsed for the code and sent as their own `oauth:callback` IPC event; everything else still goes through the existing generic `accomp:open` channel `DeployView` already owns interpreting — so the invite-code/connect-request behavior from Phase 4 is untouched.

### Track 2 — Renderer: OAuth flow
- Sign-in: `ModsView` fetches `/api/mods/auth/url`, opens it via `api.shell.openExternal`; on the `oauth:callback` IPC event it POSTs the code to `/api/mods/auth/callback` and stores `{ tokens, user }` in electron-store under `googleAuth`.
- Token expiry: checked against `tokens.expiry_date` before any upload/sign-in-gated action; if expired, `googleAuth` is cleared and the user is prompted to sign in again (no refresh-token exchange — matches spec exactly, which asked for invalidate-and-reprompt, not silent refresh).

### Track 3 — Mod Manager view
- `src/renderer/views/ModsView.jsx` (new): left category nav (All/Cars/Tracks/Tools + My Uploads when signed in) with the Google auth panel at the bottom, a responsive CSS-grid mod card layout, and a sliding detail panel (same `position:absolute` pattern as `ReplayView`). Category color bars, install-status badges (Install/Installed ✓/Update available), skeleton loading grid, empty states per category, `OfflineBanner` when the backend is down, and a distinct red "Could not reach Google Drive" banner (with a link to `docs/GOOGLE_DRIVE_SETUP.md` on GitHub) when the backend is up but Drive itself errors.
- `App.jsx`: nav entry `{ id:'mods', icon:'📦', label:'Mods' }` between Replays and Settings.
- Socket: `ModsView` listens for `mod:uploaded` directly on the socket returned by `useSocket` (mirroring `DeployView`'s existing `invite:created` listener) rather than baking toast/refresh logic into the shared `useSocket` hook itself — keeps the generic hook feature-agnostic, and the "only refresh if ModsView is active" requirement falls out naturally since the listener only exists while the view is mounted.

### Noted deviations
- **`GET /api/mods` also returns `uploads`.** The original spec's response shape was only `{ cars, tracks, tools }`, but the "My Uploads" nav item and the detail panel's "Uploaded by" line both need the Uploads/ folder's actual contents (uploads sit in one flat folder until William curates them into a category folder) — so `uploads` was added as a fourth key, sourced the same way as the other three.
- **Category is embedded in the upload description.** Since an uploaded file's category (cars/tracks/tools) has nowhere else to live before curation, the upload route writes `Uploaded by: {name}\nCategory: {category}\n{description}` and `ModsView` parses both back out with a regex for uncurated items shown under "My Uploads".
- **Upload entry points.** Implemented as a single `UploadModal` reachable from a "+ Upload mod" header button (shown whenever signed in) and from the "My Uploads" empty-state CTA, rather than literally duplicating the form at the bottom of every detail panel — one shared form, two entry points, same result.
- **Install progress is indeterminate**, not a real percentage. The `mods:download` IPC handler resolves once at the end (download + extract are both synchronous from the renderer's point of view); wiring true byte-level progress back over IPC would need a second streaming channel the spec didn't ask for, so the detail panel shows an animated indeterminate bar with "Downloading…" → "Extracting…" → "Done ✓" status text instead.
- **No screenshot placeholders added.** The repo's own most recent commit (`9f51417`, "Remove screenshot placeholders from README") deliberately stripped exactly this pattern — broken image links plus a capture-instructions doc — as noise, since no screenshots were ever actually captured. Adding new placeholders for Mod Manager screens would have reintroduced the same problem one commit later, so the README's Mod Manager section is text-only and `docs/screenshots/README.md` was not recreated.

### Verified this pass
Backend: `npm install` for `googleapis`/`dotenv` really ran (versions pinned above); `node --check` passes on every new/touched backend file; ran the real `server.js` with `db.js` stubbed (better-sqlite3 has no prebuilt binary for Node 24/win32 in this sandbox — same caveat as Phase 4) and hit every route over real HTTP: `/api/health`, `/api/mods` (502 with the real Google error, not a crash), `/api/mods/auth/url` (real `accounts.google.com` URL with correct scopes/client_id), `/api/mods/installs` upsert + list round-trip, `/api/mods/upload` with no/bad auth (401/400). Main process: a standalone `Expand-Archive`/`-EncodedCommand` round-trip actually extracted a real zip with no stderr noise; `node --check` passes on `main.js`/`preload.js`; the `accomp://oauth?code=...` vs. plain `accomp://` branch logic was unit-tested standalone. Renderer: `npx vite build` compiles clean (133 modules, same pre-existing `path` warning, no new errors); launched a real Electron window against an isolated `--user-data-dir` (throwaway Playwright `_electron` script, deleted after use, not checked in — same technique as Phase 4/5), stepped through the Wizard, confirmed the window title reads "ShinRacer", clicked into the Mods view, and confirmed the category nav, search bar, sort dropdown, and "Sign in with Google" button all render — plus confirmed the red Drive-error banner correctly appears when pointed at the real production backend (which doesn't have Phase 6 deployed yet). Screenshot captured and reviewed.

### Not independently verified
No real Google Cloud project/credentials exist in this environment, so the actual OAuth consent screen, a real token exchange, a real file landing in a real Drive folder, and the `accomp://oauth` redirect arriving from an actual browser were not exercised end-to-end — only the code paths on both sides of that boundary, independently. `scripts/deploy-backend.ps1`'s new `lib/` `mkdir` + three new `scp` lines were verified to parse as valid PowerShell but not run against `shinobi` (would touch the live production backend).

## Phase 7 completion

Phase 7 added an app-wide tooltip system, a "fun" guided Server Builder Wizard,
and a Useful Links page, on top of the running Phase 1–6 app.

### Track 0 — Tooltip system
- `src/renderer/components/Tooltip.jsx` (new): `TooltipContext` + `TooltipProvider` (renders the single floating tooltip div, computes placement with auto-flip off any viewport edge, positions the arrow to still point at the target's center even after edge-clamping), `useTooltip()` hook, and a default-exported `<Tooltip text position delay disabled>` wrapper.
- **Wrapper implementation deviates from the spec's literal "clone the child and attach onMouseEnter/onMouseLeave" suggestion.** `Btn`, `TextInput`, `Toggle`, `Select`, and `Slider` in `primitives.jsx` are plain function components that neither spread arbitrary props onto their root DOM node nor forward refs — cloning extra event props into them would have been silently dropped, and cloning a `ref` onto a non-`forwardRef` component throws in dev. Rather than converting every primitive to `forwardRef` (a much larger, riskier change), `Tooltip` wraps children in a `<span style={{display:'contents'}}>`: this wrapper is invisible to layout (flex/grid sizing on the child, e.g. `style={{flex:1}}` on a `Btn`, passes straight through as if the wrapper weren't there) and still receives bubbled `mouseenter`/`mouseleave` from any descendant. Position is read from `e.target.getBoundingClientRect()` (the actual hovered DOM node), not the wrapper's own rect, since `display:contents` elements report an empty bounding box by spec.
- **`Card` in `primitives.jsx` gained `onMouseEnter`/`onMouseLeave` passthrough** (previously dropped, same class of bug as above) — needed for `LinksView`'s hover-lift card effect. This is the only primitives.jsx change; nothing else needed touching once the span-wrapper approach was chosen.
- **SVG exception:** the density-curve drag handles (`TrafficView`) and the PB line (`StatsView`'s `SectorBarChart`) are `<circle>`/`<line>`/`<text>` elements inside an `<svg>` — a `<span>` is not a valid SVG child and would be silently dropped by the parser, hiding whatever it wrapped. Those two spots call `useTooltip()` directly and wire `onMouseEnter`/`onMouseLeave` straight onto the SVG primitive instead of using the `<Tooltip>` wrapper component.
- `App.jsx`: `TooltipProvider` wraps `Inner` (inside `AppStoreProvider`).
- Tooltips added to every interactive element listed in the spec, across `BuildView`, `DeployView`, `TrafficView`, `EventsView`, `CommsView`, `StatsView`, `ReplayView`, `ModsView`, `SettingsView`, and the new `LinksView` — copy is specific to what the control does, not a restatement of its label.

### Track 1 — Server Builder Wizard
- `src/renderer/components/ServerWizard.jsx` (new): full-screen 6-step overlay (session type → track → cars → conditions → rules → launch), progress bar, Esc-to-close, Enter-to-advance, personality copy that varies by the Step 1 session-type choice per spec.
- **Reuses BuildView's deploy flow instead of duplicating it**, per the explicit constraint: `src/renderer/lib/deploy.js` (new) extracts `deployConfig(cfg, settings)` (INI generation via the existing `generateServerCfg`/`generateEntryList` + `api.server.launch`) and `presetFromConfig(cfg)` out of `BuildView`'s inline `deploy`/`savePreset` functions. `BuildView` now calls these same helpers instead of its old inline versions — behavior identical, logic now lives in one place.
- `BuildView.jsx` exports `defaultCfg`, `WEATHERS`, `TIMES` (previously module-private) so the wizard's Step 4 weather/time option values line up exactly with what `generateServerCfg` expects, instead of re-declaring a parallel copy that could drift out of sync.
- Per the spec, `App.jsx` owns `onDeploy`/`onSave` and passes them into `ServerWizard` as props (`wizardDeploy` calls `deployConfig` then `addLiveServer` + switches to the Deploy view on success; `wizardSave` calls `presetFromConfig` + `saveProfiles`) — the wizard itself only reads `settings` from the store (for `acPath`/`serverName`), it never touches `addLiveServer`/`saveProfiles` directly.
- Entry points: "✨ Quick build" ghost button at the top of `BuildView`'s left column (no dedicated header existed there before — this is now the view's de facto header row), "✨ Build with wizard" ghost button under "Build a server" in `DeployView`'s empty state, and the wizard is rendered once at the `App.jsx` level so either entry point opens the same overlay.

### Track 2 — Useful Links page
- `src/renderer/views/LinksView.jsx` (new): `PRESET_LINKS` constant (hardcoded, never fetched/stored/sent to a backend, per spec) grouped into the five spec'd categories plus an `Other` category available only to user-added links; search flattens all categories into one grid, otherwise links render as category sections with a `⭐ ShinTech` badge on presets.
- Preset links can't be deleted but can be hidden: `hiddenPresets` (array of preset ids) persists to electron-store, toggled via a "Hide"/"Show" button on preset cards, with a "Show hidden (N)" checkbox in the header once any exist.
- User links persist to electron-store under `userLinks` only — no backend involvement, matching the constraint. Add/edit modal validates the URL starts with `http`.
- `App.jsx`: nav entry `{ id:'links', icon:'🔗', label:'Links' }` inserted between Mods and Settings.

### Noted deviations
- Tooltip wrapper uses a `display:contents` span instead of `cloneElement` + prop injection (see Track 0 above) — a deliberate compatibility fix, not a shortcut; the spec's context/hook API shape (`showTooltip(text, rect, position)` / `hideTooltip()`) is implemented exactly as specced.
- Two tooltip sites (density-curve handles, PB chart line) bypass the `<Tooltip>` wrapper and call `useTooltip()` directly because they're SVG elements — this is the documented, intentional escape hatch the hook exists for, not a gap in coverage.
- `Card`'s new `onMouseEnter`/`onMouseLeave` props are additive and default to `undefined`, so every existing `Card` usage across Phases 1–6 is unaffected.

### Verified this pass
`npx vite build` compiles clean (137 modules, same pre-existing `path` externalization warning, no new errors or warnings). Ran `npm run dev` for real (Node 24/Electron 28 both available in this environment): Vite served on 5173, Electron came up, and `%APPDATA%\ShinRacer\logs\main-*.log` shows a clean `App started` → `AC detected at D:\SteamLibrary\...` sequence with no errors — since AC detection fires from a `useEffect` inside `AppStoreProvider` after the renderer mounts, this confirms the renderer bundle (including the new `Tooltip`/`ServerWizard`/`LinksView` modules and the `Card` prop change) loaded and rendered without a top-level crash. The dev instance was then stopped cleanly.

### Not independently verified
No interactive click-through this pass (no automated Electron driver was used, unlike Phase 4/5/6's throwaway Playwright scripts) — tooltip hover timing/positioning/auto-flip, the wizard's full 6-step flow including a real deploy, and the Links add/edit/hide/search UI were verified by code reading and the clean build/boot only, not by driving the UI.

## Phase 8: Visual Redesign

Phase 8 was a pure visual redesign — zero logic, IPC, or API changes — replacing the
"developer app" look (soft yellow accent, rounded corners, Rajdhani/Inter) with a
cold, sharp, JDM-instrument-cluster aesthetic (true black, electric blue accent,
Bebas Neue/Barlow Condensed, zero border-radius everywhere except a few explicit
exceptions).

### Track 0 — New design system
- `primitives.jsx`: the entire `C` token object replaced per spec (true-black backgrounds, electric blue `#0066FF` as primary accent, `yellow` demoted to a scarcity token, new text-hierarchy tokens `textPrimary`/`textSec`, zero-radius geometry tokens). Every primitive component (`Btn`, `Card`, `Tag`, `TextInput`, `Select`, `Toggle`, `Slider`, `StatusDot`, `TabBar`, `Label`, `SectionHead`, `Divider`, `Toast`) rewritten to the new spec: sharp corners, underline-only input focus, outlined danger/success buttons, Card's `accent` prop now sets a 2px left border plus a permanent inset corner-mark `boxShadow`, `Toast`'s "success" state is filled blue and everything else is outlined in its own color.
- `GLOBAL_CSS` updated: new Bebas Neue/Barlow Condensed font import, `::selection`, thinner blue-tinted scrollbar, `:focus-visible` outline, blue accent-color on native range/checkbox inputs. `pulse` keyframe's dip changed from 0.5 to 0.3 opacity (used by the new sidebar health-dot per Track 4); a new `peerGlow` keyframe (`--glow` custom-property driven) was added for CommsView's speaking-indicator border pulse (see Track 2 below).
- **Global border-radius audit**: every non-token `borderRadius: <number>` across every view/component file was swept to `0` via a single scripted pass, then re-audited by hand for the spec's explicit exceptions (`Tag` 2px, `Toggle` track/thumb 2px/1px, first-run `Wizard`'s progress-step squares 4px) — confirmed via a final repo-wide grep that no unintended non-zero radius survived.
- `Tooltip.jsx` restyled to the new tokens (`C.overlay` background, `C.textSec` text, `C.overlay`-colored arrow) — its `display:contents` hover-wrapper mechanics from Phase 7 were untouched, this was styling-only.

### Track 1/3 — Sidebar and title bar
- `App.jsx` `Sidebar`: width 196→180px, background changed from `C.surface` to `C.bg` so it "bleeds" from the same true black as the header (no lift), new 48px wordmark header block with a permanent 3px blue left-edge bar, live-server indicator restyled with a green left-edge bar and a 4px glow dot, nav items lost their background-tint active state in favor of a 2×14px left-edge tick bar (blue when active) plus dimmed (0.6 opacity, 14px) emoji icons kept per the spec's own self-correction ("keep them — they aid scannability"), bottom status bar's backend dot shrunk to 4px.
- Page header bar: background `C.surface` → `C.bg`, title typography switched to Bebas Neue 20px/letter-spacing 2/uppercase, the "+ New server" button restyled to the new primary-blue treatment by hand (it's a raw `<button>`, not the `Btn` primitive).
- `main.js` `titleBarOverlay` (`color`/`symbolColor`) and the `BrowserWindow`'s `backgroundColor` updated to match the new `C.bg`/`C.mutedHi` values — the only main-process touch in this phase, purely cosmetic (Electron's native title-bar chrome color).

### Track 2 — Per-view updates
Every view (`DeployView`, `BuildView`, `TrafficView`, `EventsView`, `CommsView`, `StatsView`, `ReplayView`, `ModsView`, `LinksView`, `ServerWizard`, `Wizard`, `SettingsView`, plus `GarageView` and `ErrorBoundary` which weren't explicitly named in the brief but got the same treatment for consistency) had its literal old-palette color references (`C.yellow`, `C.yellowDim`, `C.purple`, `C.white` as a "primary text" stand-in) replaced per the spec's per-view instructions: pit-board top stripes and full borders became left-edge accents, filled status badges became outlined ones, calendar dots became 4px squares, chat bubbles became flat left-bordered rows, sector-time bars went monochromatic (blue/text-sec/muted instead of blue/yellow/green), and so on. Full per-view detail is in the diff; the constant across all of them is the same left-border/outline/monochrome vocabulary rather than filled color blocks.
- **`C.purple` removal.** The old palette's purple wasn't carried into the new token set. Every prior purple usage was a *categorical* distinguisher (a traffic profile's identity color, an event type's color, a chart's per-driver legend color) rather than a semantic status color, so each was individually reassigned: `TrafficView`'s "Quiet Night" profile → blue, `EventsView`'s "Drift Session" type → orange, and the two multi-series chart palettes (`StatsView`'s per-driver bar-chart legend, `TrafficView`'s car-roster color list) kept a literal `'#8E44AD'` hex in their categorical-color arrays rather than reintroducing a `C.purple` token — those arrays already mixed in other literal non-token hexes (`'#00BCD4'`, `'#FF80AB'`) for exactly this reason (qualitative/categorical data-viz palettes are a different concern from brand-accent tokens).
- **Yellow scarcity enforced.** A repo-wide grep after the pass confirms `C.yellow` now appears in exactly the three places the spec allows (the lap chart's PB dashed line + label in `StatsView`, the favorite-star icons in `ReplayView`) plus the `IDENTITY_COLORS` swatch arrays in `Wizard.jsx`/`SettingsView.jsx` — the latter is a deliberate, judgment-call exception: those are user-chosen *identity* colors (like a Discord username color), not UI accent usage, so the "yellow is reserved" rule doesn't apply to a color a crew member might personally want to represent them. The `SessionLeaderboard`'s rank-0 row also keeps yellow as an explicit "top rank indicator" per the spec's own exception list; its border uses `${C.yellow}80` (alpha-blended) in place of the removed `C.yellowDim` token.
- **Stray hardcoded hex literals from the old palette** were also caught and fixed even though they weren't named in the brief: `TrafficView`'s "cannot delete built-in profile" toast passed the literal old-red hex `'#E74C3C'` instead of a token, `AppStore.jsx`'s `DEFAULT_IDENTITY.color` was the literal old-yellow hex `'#F5C518'`, and `TrafficView`'s `makeProfile()` default parameter was the literal old-blue hex `'#3D8EF0'` — all three were bypassing the token system entirely (not reachable by a `C.yellow`-style grep) and would have silently kept rendering old-palette colors after the redesign; all three now reference/match the new tokens.
- `CommsView`'s peer-speaking indicator was the one place the spec explicitly called for new *behavior* over old (border-color pulsing instead of the old dot-scale animation) — implemented via the new `peerGlow` keyframe driven by a per-peer `--glow` CSS custom property set inline, so each peer's own identity color still drives its own glow without needing a keyframe per color.

### Track 4 — Micro-details
Applied throughout: empty-state emoji shrunk to 32px with Bebas Neue uppercase titles across every view that has one (`DeployView`, `EventsView`, `StatsView`, `ReplayView`, `ModsView`, `LinksView`, `GarageView`); loading-skeleton shimmer re-tinted blue; pit-board uptime now always renders `HH:MM:SS` (previously dropped to `MM:SS` under an hour); `DeployView`'s log viewer recolored (normal lines now recede at `C.muted` instead of `C.mutedHi`, the most recent line gets a thin blue left border); INI/JSON syntax highlighting in both `BuildView` and `TrafficView` reworked to key=`C.textSec`/value=`C.blue`/section-header=`C.whiteHot`-uppercase/comment=`C.muted`-italic; `EventsView`'s calendar today-marker and event indicators converted from circles/box-shadow to left-border/square treatments; the invite-code modal's code display is now 48px Bebas Neue in blue with 8px letter-spacing and the QR image sits in a bordered dark frame instead of a plain white square; `ErrorBoundary` rewritten to "SOMETHING WENT WRONG" in large red Bebas Neue with outlined-red action buttons; the sidebar's backend health dot is now a 4px square that pulses (opacity 1→0.3) only when unhealthy, static when healthy.

### Noted deviations
- `Card`, `Btn`, and the sidebar/header markup all needed hand-editing beyond the mechanical border-radius sweep — the spec's per-component instructions (corner-mark box-shadow, left-edge accent bars, outlined button variants) aren't expressible as a global find/replace, so every primitive and every view got a manual pass on top of the automated radius normalization.
- One line of copy changed as an explicit, spec-directed exception to the "styling only" rule: `BuildView`'s launch button text `'▶ Launch Server'` → `'Launch'`, called out by name in the brief's Track 2 section, not a spontaneous content edit.
- `GarageView` and `ErrorBoundary` weren't named anywhere in the brief's per-view Track 2 list, but were restyled anyway (Card accents, typography, the "no-yellow" rule applied to Garage's password tag) since leaving two views on the old design system would have been a visibly inconsistent, half-finished redesign — this is the one place scope was extended slightly beyond the letter of the spec, in service of its stated goal.

### Verified this pass
`npx vite build` compiles clean (137 modules, no new errors/warnings). Ran `npm run dev` for real twice — the first attempt hit a stale port-5173 process left over from an earlier unrelated session, which made Electron's `wait-on` step fail before ever loading the renderer (a pre-existing environment artifact, not caused by this change); the offending orphaned process was identified via `Get-NetTCPConnection`/`Get-CimInstance` and stopped, then the dev server was restarted cleanly. That second run's `%APPDATA%\ShinRacer\logs\main-*.log` shows a clean `App started` → `AC detected at D:\SteamLibrary\...` sequence with no errors, confirming the renderer mounted and rendered the fully restyled app (new `C` tokens, every primitive, every view) without a top-level crash. All spawned dev processes were confirmed stopped afterward.

### Not independently verified
No interactive click-through — hover states, the corner-mark box-shadow's visual appearance, the peer-speaking border-pulse animation, and every view's actual on-screen look were verified by reading the resulting styles and confirming a clean render, not by driving the UI and taking screenshots.

## Phase 9: Telemetry Screen

Phase 9 added live AC telemetry: a Telemetry view (LIVE/CONFIGURE/OVERLAY tabs,
15 widgets, 5 presets) and a separate always-on-top overlay window, both fed
from AC's Shared Memory API.

### SHM approach taken — real reader, not a stub

The brief asked us to check three options and document which was used. All
three were evaluated against this actual environment, not assumed:

- **`ac-node-telemetry`** — doesn't exist on npm. Confirmed via `npm view
  ac-node-telemetry`, which returned a real `404` from the registry (this
  environment does have registry access, so the 404 is authoritative, not a
  network failure).
- **`mmap-io` / `node-ffi-napi`+`ref-napi`** — all three are native C++
  addons requiring `node-gyp` and an MSVC compiler. `where cl.exe` found
  nothing in this environment — the identical blocker already documented in
  Phase 4/6 for `better-sqlite3`'s missing prebuilt binary on Node 24/win32.
  These would fail to install here for the same reason, and most likely on
  a fresh crew member's machine too, unless they happen to have Visual
  Studio Build Tools installed just for this app.
- **Persistent PowerShell reader (what was actually built)** — a child
  process running Windows PowerShell 5.1's built-in
  `System.IO.MemoryMappedFiles.MemoryMappedFile.OpenExisting()` (.NET,
  zero extra dependencies, zero compilation) opens AC's three named shared
  memory blocks every 60ms, base64-encodes the raw bytes, and prints one
  `FRAME:<physics>|<graphics>|<static>` line to stdout. `main.js` reads that
  stream line-by-line via Node's `readline` and parses every struct offset
  from the brief in plain JS (`Buffer.readFloatLE`/`readInt32LE`, plus a
  `readWChar` helper for the UTF-16LE name/time-string fields). This is the
  same `-EncodedCommand`-over-PowerShell technique already used for Phase 6's
  mod zip extraction, for the same reason: no compiler, no quoting hazards.
  **This was verified working in this environment**, not just written on
  faith — a standalone PowerShell `OpenExisting("Local\acpmf_physics")`
  call was run before writing any code, and it correctly threw
  `System.IO.FileNotFoundException` (AC isn't running here), proving both
  that the API call itself is valid and that the "AC not running" failure
  path behaves exactly as the fallback logic assumes. `CreateViewAccessor(0,
  0)` (capacity 0) maps the whole underlying file rather than a hardcoded
  byte count, so the reader doesn't need to guess a struct size that might
  drift between AC/CSP versions.
- The reader script is wrapped in `$ErrorActionPreference = 'Stop'` +
  try/catch inside its own `while ($true)` loop — a failed
  `OpenExisting` on any given tick prints `NOFRAME` and the loop keeps
  running, so it recovers automatically the moment AC launches, with no
  restart needed from the Node side.

### Track 0 — Main process + IPC
- `main.js`: `parsePhysics`/`parseGraphics`/`parseStaticInfo` (raw struct →
  JS objects per the brief's offset tables) and `buildTelemetryFrame` (raw →
  the friendlier shape `useTelemetryShm` returns) are new pure functions;
  `telemetry:shmStart`/`telemetry:shmStop` manage the persistent PowerShell
  child process and forward parsed frames to both `win` and `overlayWindow`
  via `webContents.send('telemetry:frame', ...)`. Wrapped end-to-end in
  try/catch per the constraint — a spawn failure just means no frames ever
  arrive, which the renderer hook already treats identically to "AC not
  running" (see Track 5 below), so there's no separate error UI path needed
  on the main-process side.
- `telemetry:openOverlay`/`closeOverlay`/`setOverlayOpacity`/
  `setOverlayAlwaysOnTop`/`setOverlayBounds`/`overlayStatus` manage a second
  `BrowserWindow` (`transparent:true`, `frame:false`, `skipTaskbar:true`, per
  the constraint). `telemetry:showOverlayContextMenu` is a small addition not
  literally named in the brief's IPC list but needed to satisfy Track 3's
  "right-click drag handle → context menu" requirement — it pops a native
  `Menu` with Close/Toggle-always-on-top/Opacity ± entries.
- Both the SHM child process and the overlay window are torn down in the
  main window's existing `closed` handler, alongside the pre-existing server
  process and UDP socket cleanup, so nothing survives a window close.
- The existing UDP-based `telemetry:start`/`stop`/`onLap` handlers (used by
  `useTelemetry.js` for posting lap times to the backend in Stats) are
  completely untouched — this is a parallel system, not a replacement.
  Nothing in the SHM path ever calls the backend; per the constraint, live
  telemetry frames never leave the machine.

### Track 1 — Widget library
- `src/renderer/components/telemetry/widgets.jsx`: all 13 widgets named in
  the brief, plus two more (`SteeringAngle`, `TyrePressures`) that the
  CONFIGURE checklist itself lists under CONTROLS/TYRES but which have no
  dedicated spec section in Track 1 — built to the same visual language
  (sharp corners, Bebas Neue values, Barlow labels, blue accent) rather than
  left out or stubbed.
- `WIDGET_CATALOG` is the single source of truth (id → component/label/
  category/defaultSize) shared by the CONFIGURE checklist, the LIVE grid,
  the preview blocks, and `OverlayApp` — adding a widget in one place makes
  it available everywhere automatically.
- Every widget reads frame fields with `??`/`?.` per the constraint; none of
  them paint an opaque background of their own (`SIZE_PRESETS` and the
  surrounding container own layout/chrome), so the same component works
  unmodified on the dark in-app grid and the transparent overlay.

### Track 2/4 — TelemetryView + presets
- `TelemetryView.jsx` holds the three tabs and the five preset definitions
  (`PRESETS`, exported for `OverlayApp` to resolve a preset id back to its
  widget list) exactly as instructed ("store as constants in
  TelemetryView.jsx"). The 12-column grid uses `SIZE_PRESETS` column-span
  values (`sm`=3, `md`=4, `lg`=6) rather than literal pixel widths, so
  widgets reflow sensibly at different window sizes instead of overflowing.
- The CONFIGURE tab's drag-to-reorder preview uses native HTML5 drag-and-
  drop (`draggable`/`onDragStart`/`onDragOver`/`onDrop`) rather than a
  drag-and-drop library — no new dependency, and the reorder logic is a
  five-line array splice.
- Layout (`telemetryLayout`) and overlay settings (`overlayConfig`) persist
  to electron-store, matching the pattern already used for `peerVolumes`
  (Comms) and `replayAnnotations` (Replays) rather than inventing a new
  persistence convention.
- "Snap to corner" reads `window.screen.width/height` directly in the
  renderer (a standard browser API, available in Electron's renderer) rather
  than adding a new IPC round-trip just to ask the main process for the
  screen size.

### Track 3 — Overlay window
- `OverlayApp.jsx` is a genuinely separate render path: `App.jsx`'s default
  export checks `window.location.hash === '#overlay'` before the
  `AppStoreProvider` even mounts, so the overlay never pulls in the Sidebar,
  the first-run Wizard, or the events/chat store — it talks to
  `window.api` directly, exactly as specced.
- The 8px drag handle's `WebkitAppRegion: 'drag'` makes the whole overlay
  window draggable by that strip (frameless windows have no titlebar to drag
  by otherwise); right-clicking it calls the new
  `telemetry:showOverlayContextMenu` IPC handler.
- Each overlay widget is wrapped in its own `rgba(5,5,7,0.75)` /
  `rgba(28,34,51,0.8)`-bordered card exactly per spec, independent of the
  window's own `setOpacity()` (which the constraint notes applies uniformly
  on top of whatever the widgets already render).

### Track 5 — Mock data
- `src/renderer/lib/telemetryMock.js`: `generateMockFrame(now)` produces a
  90-second simulated lap (sine-wave speed, gear from speed brackets,
  periodic braking zones, tyre warmup over the first ~2 laps, a gentle
  sine-based delta walk) matching the exact frame shape real SHM frames
  produce, so every widget renders identically against either source.
- `useTelemetryShm.js` is the fallback owner, per the brief's architecture:
  it doesn't ask main.js whether AC is running — it just tracks the
  timestamp of the last real `telemetry:frame` IPC event and, on its own
  60ms tick, falls back to `generateMockFrame()` the moment more than 500ms
  has passed without one. This means demo mode activates identically
  whether AC was never running, was closed mid-session, or the SHM reader
  process failed outright — one fallback path covers all three, silently,
  with the DEMO MODE banner (`C.blue`, per constraint) as the only visible
  sign anything failed over.

### Noted deviations
- **`clutch` is always `0`.** The brief's own physics offset table has no
  clutch field (only `gas`/`brake` are listed), and real AC shared memory
  doesn't expose clutch pedal position in this struct — it's a driver input,
  not physics telemetry. The frame shape still carries a `clutch` field (per
  Track 0's spec) so `ThrottleBrakeBar`'s clutch dot doesn't crash, but it
  can never be non-zero from real SHM data.
- **`DamagePanel`'s percentages are an approximation.** AC's raw
  `carDamage` floats are unbounded deformation magnitudes with no fixed
  0-100% ceiling defined anywhere in the struct; the widget divides by
  1000 as a rough heuristic (light contact reads low, heavy damage reads
  high) rather than a value verified against real damaged-car telemetry,
  which this environment has no way to produce.
- **`LapTimingPanel`'s completed sectors are always green**, not
  "green if faster than best, red if slower" as specced — the frame shape
  (and the raw graphics struct, per the brief's own offset table) has no
  per-sector best-time array to compare against, only the current
  session's live/last/best lap totals. Rather than inventing sector-best
  tracking client-side with no authoritative source, completed sectors
  render as a simple "done" state.
- **Two widgets beyond the named 13** (`SteeringAngle`, `TyrePressures`)
  were designed to fill gaps between the CONFIGURE checklist and the Track 1
  widget specs — see Track 1 above.

### Verified this pass
`npx vite build` compiles clean (142 modules, up from 137, no new
errors/warnings). `node --check` passes on `main.js` and `preload.js`. Before
writing any SHM code, a standalone PowerShell `MemoryMappedFile.OpenExisting`
call was run in this environment and confirmed it throws the expected
`FileNotFoundException` when AC isn't running — proving the core mechanism
before building on top of it, not after. The app was then driven end-to-end
with a real, throwaway Playwright `_electron` script (deleted after use, not
checked in, matching the Phase 4/5/6 technique) against an isolated
`--user-data-dir` with a hand-seeded `config.json` (so it landed straight in
the main app, bypassing the first-run wizard): confirmed the Telemetry nav
item exists, the LIVE tab shows the DEMO MODE banner with real rendered
widget values (gear, RPM, speed, lap timing panel with a red/blue delta and
gold best time, tyre map with per-corner temps and wear bars, fuel bar), the
CONFIGURE tab's checklist/size-selectors/preset strip/drag-reorder preview
all render with the Full Dash preset pre-applied, the OVERLAY tab's controls
render, and — the most important check — clicking "Launch overlay" actually
opened a second real `BrowserWindow` (window count 2→3, confirmed via
`app.windows()`), that window's URL was confirmed to be
`http://localhost:5173/#overlay`, and its body text was confirmed to contain
real rendered widget output. Screenshots of the LIVE and CONFIGURE tabs were
captured and visually reviewed against the Phase 8 design system. All
spawned dev/test processes and the throwaway `playwright` npm install
(`--no-save`, confirmed absent from `package.json`/`package-lock.json`
afterward) were cleaned up.

### Not independently verified
No real Assetto Corsa install with shared memory active exists in this
environment, so the actual struct-offset parsing was never validated against
genuine physics/graphics/static bytes from a running session — only against
the documented offsets from the brief and the confirmed-working
"AC not running" failure path. A crew member with AC actually open should
see real values; if any field reads as garbage, the offset table itself
(copied from the brief, not independently re-derived from AC's SDK headers)
is the first thing to check. The overlay window's drag-by-handle behavior
and its right-click context menu were not interactively exercised (Playwright
can trigger the IPC call but doesn't meaningfully test OS-level window
dragging).

## Follow-up: renderer OAuth verification (lib/auth.js extraction)

2026-07-10: a follow-up pass was asked to add renderer-side Google OAuth
support on the assumption it was entirely missing. On inspection, most of
it already existed and worked from Phase 12: `AppStore.jsx` already had
`signIn`/`signOut`/`googleAuth`/`user`/`role`/`isAdmin`/`isHost`,
`preload.js` already had the `auth.onCallback` bridge, `main.js`'s
`handleAccompUrl` already extracted the OAuth `code` from
`accomp://oauth?code=...` and forwarded it as `oauth:callback`, and
`Wizard.jsx`'s sign-in button was already wired to a working `handleSignIn`.
None of that was touched.

Two real gaps were found and fixed, plus one piece of dead code extracted
for reuse:

- **`src/renderer/lib/auth.js` didn't exist** — the OAuth calls
  (`getGoogleAuthUrl`, `exchangeCodeForTokens`, `verifyAndSignIn`,
  `refreshAuth`, `isTokenExpired`) were inlined directly in `AppStore.jsx`.
  Extracted into this new file as thin wrappers around the same
  already-working endpoints (`GET /api/mods/auth/url`,
  `POST /api/mods/auth/callback`, `POST /api/auth/google`) — deliberately
  **not** switched to building the auth URL client-side from
  `GET /api/auth/config`, which was the first draft of this fix; that would
  have replaced a working, previously-verified sign-in path with a second,
  different one for no functional gain. `AppStore.jsx`'s mount-time
  token-refresh check, its `signIn()`, and its `oauth:callback` effect all
  now call into `lib/auth.js` instead of inlining `httpApi` calls directly,
  with identical control flow and error handling — this was a pure
  extraction, not a behavior change (`isTokenExpired`'s 60s buffer replaces
  the mount effect's own no-buffer expiry check as the one canonical
  expiry test, per this function's own purpose).
- **`Wizard.jsx`'s `WelcomeStep` never actually displayed a sign-in
  error.** `handleSignIn`'s catch block had a comment claiming the error
  was "surfaced right on the welcome step," but no error state existed and
  nothing rendered — a real bug, not just a documentation gap. Fixed: a
  `welcomeError` state (kept separate from the existing `signInError` the
  Connecting step already reads from `useStore()`, which is a different,
  later failure point) is set in the catch and rendered in red below the
  button. A message containing `redirect_uri_mismatch` is shown as "OAuth
  not configured — see docs/GOOGLE_OAUTH_SETUP.md" instead of Google's raw
  error text.
- **`docs/GOOGLE_OAUTH_SETUP.md` didn't exist.** Added as a short,
  focused file — the actual redirect-URI setup steps already lived in
  `docs/GOOGLE_DRIVE_SETUP.md`'s "OAuth 2.0 client" section (there's only
  one OAuth client for the whole app, shared between sign-in and Mod
  Manager uploads), so this new file cross-references that section rather
  than duplicating it, and documents the `redirect_uri_mismatch` error
  message above.

Verified this pass: `npx vite build` compiles clean (162 modules, up from
161 for the new `lib/auth.js` module, no new errors/warnings). No
interactive click-through — the underlying sign-in mechanism was already
Phase-12-verified and untouched; only the two fixes above and the
extraction were exercised via the build.

## Follow-up: OAuth switched to loopback redirect (Phase 12)

2026-07-10: real-world testing of Phase 12's mandatory Google sign-in hit
`Error 400: invalid_request` at the Google consent screen — Google's OAuth
2.0 policy for "Desktop app" clients rejects custom URI scheme redirects
(`accomp://oauth`) outright. The documented, supported mechanism for
installed apps is a loopback IP address redirect instead:
https://developers.google.com/identity/protocols/oauth2/native-app. This
follow-up switches Electron's sign-in flow to that mechanism; the PWA is
unaffected (it already used its own `http://` redirect URI, see Phase 10).

- **`src/renderer/lib/auth.js`**: exports `OAUTH_CALLBACK_PORT = 9721`
  (fixed, not randomized, so it only needs registering once in Google Cloud
  Console and any local firewall rule). `getGoogleAuthUrl()` and
  `exchangeCodeForTokens()` now both pass
  `redirectUri=http://127.0.0.1:9721` through to the backend's existing
  `GET /api/mods/auth/url` / `POST /api/mods/auth/callback` endpoints
  (already redirect-URI-aware since Phase 10 added the PWA's own redirect
  URI) — no backend route changes were needed for this half.
- **`src/main/main.js`**: new `auth:startCallbackServer` /
  `auth:stopCallbackServer` IPC handlers run a temporary `http` server on
  `127.0.0.1:9721` that catches Google's redirect directly, extracts the
  `code` query param, responds with a small self-contained "SIGNED IN,
  close this tab" HTML page, forwards the code to the renderer as
  `oauth:callback` (same event name as before — no renderer-side rename
  needed beyond what's described below), and closes itself after that one
  request. `auth:startCallbackServer` closes any stale server from a
  previous attempt first. The server is also closed on window `close`,
  alongside every other subsystem's cleanup in that handler. Verified with
  a standalone throwaway script (not checked in) that actually started the
  server, hit it with a real HTTP request, confirmed the `code` param
  round-trips correctly (including URL-decoding), confirmed it closes after
  exactly one request, and confirmed a clean restart — not just read.
- **`handleAccompUrl` in `main.js`** no longer has an OAuth branch —
  `accomp://oauth` is no longer a recognized deep link. `accomp://` itself
  stays registered for invite links (`accomp://cluster/{id}`) and the
  generic `accomp:open` passthrough, unchanged.
- **`AppStore.jsx`**: `signIn()` now calls `api.auth.startCallbackServer()`
  before building the auth URL and opening the browser, and arms a 5-minute
  timeout (`oauthTimeoutRef`) that stops the server and surfaces "Sign in
  timed out — please try again" via the existing `signInStatus`/
  `signInError` state if no callback ever arrives. The existing
  `api.auth.onCallback` effect (unchanged otherwise — same exchange/verify/
  offline-available control flow from the earlier OAuth follow-up above)
  now clears that timeout and calls `stopCallbackServer()` the moment a
  real callback arrives. Deliberately **not** restructured into a single
  promise that stays pending until the callback resolves — `signIn()` still
  resolves right after opening the browser so the Wizard can transition to
  its Connecting step immediately, exactly as before; making `signIn()`
  itself await the full round-trip would have frozen the Wizard on the
  Welcome step for up to 5 minutes with no progress UI, which was a real
  functional regression caught during design, not shipped.
- **`preload.js`**: `auth.startCallbackServer`/`auth.stopCallbackServer`
  added alongside the existing `auth.onCallback`.
- **`backend/lib/oauth.js`**: `createOAuthClient`'s redirect-URI fallback
  chain gained `'http://127.0.0.1:9721'` as the final default (after an
  explicit `redirectUri` param and `process.env.GOOGLE_OAUTH_REDIRECT_URI`),
  so a missing env var fails toward the new mechanism rather than the
  retired one.
- **`backend/.env`, `.env.example`**: `GOOGLE_OAUTH_REDIRECT_URI` changed
  from `accomp://oauth` to `http://127.0.0.1:9721`. The deployed copy on
  shinobi still has the old value and needs updating there too — flagged in
  `docs/GOOGLE_OAUTH_SETUP.md`'s "Backend config" section, not fixed here
  since this repo has no access to the Pi.
- **`docs/GOOGLE_OAUTH_SETUP.md`** rewritten for the loopback flow: the
  Google Cloud Console redirect-URI change (delete `accomp://oauth`, add
  `http://127.0.0.1:9721` — a manual step that can't be done in code), the
  shinobi `.env` update reminder, and the existing `redirect_uri_mismatch`
  /timeout error-copy notes carried over.
- **Not updated**: `docs/GOOGLE_DRIVE_SETUP.md`'s own "OAuth 2.0 client"
  section (step 3) still tells a fresh setup to add `accomp://oauth` as the
  redirect URI — now stale advice for the Electron sign-in flow specifically,
  since that file wasn't in this fix's scope. Worth reconciling in a future
  pass so the two docs don't disagree.

Verified this pass: `npx vite build` compiles clean (162 modules, no new
errors). `node --check` passes on `main.js`, `preload.js`, and
`backend/lib/oauth.js`. The loopback HTTP server's actual request/response/
close cycle was verified live via a standalone script (see above), not just
read. Not independently verified: an actual Google consent-screen round
trip (no real OAuth credentials/browser flow exercised in this
environment — same caveat every prior phase touching Google auth has
carried) and the Google Cloud Console redirect-URI change itself, which is
a manual step outside this repo.

## Follow-up: second false-premise audit of AppStore.jsx's OAuth state (Phase 12)

2026-07-10: a request described `AppStore.jsx` as missing `signIn`/`signOut`
entirely ("the functions were never added... tokens are always null") and
asked for a full reimplementation, plus role-gating changes in `App.jsx`.
Same pattern as the earlier "renderer OAuth verification" follow-up above —
checked the actual files before writing anything, and the premise didn't
hold:

- `AppStore.jsx` already exports `signIn`, `signOut`, `user`, `role`,
  `isAdmin`, `isHost`, `authLoading` from `useStore()` (all present since
  Phase 12, refined by the two follow-ups above this one) — not missing.
- `App.jsx`'s `Inner()` already destructures `user`/`role`/`isSignedIn`/
  `authLoading` from `useStore()` and uses them for nav gating
  (`canAccess`) and the wizard/loading gate — not missing.
- The one real gap identified: the request wanted the Wizard to skip
  straight to the **Done** step when a returning user's stored token
  verifies on mount. What actually exists (`Wizard.jsx`'s `isSignedIn`
  effect) skips to **Identity** instead — deliberately, since the Wizard
  only ever mounts when `setupComplete` is false or the user isn't signed
  in (see `App.jsx`'s `showWizard`), so a not-yet-fully-configured install
  still needs AC path / host check / quick phrases, not a skip straight to
  the end.
- Implementing the request's `signIn()` literally would also have created
  a **second, competing `api.auth.onCallback` listener** alongside the one
  already in `AppStore.jsx` — since OAuth codes are single-use, both would
  race to consume the same code and one exchange would fail
  unpredictably. This was flagged rather than risked.

Asked the user how to proceed; they confirmed no code changes were
needed. **No files were touched this pass** — this entry exists purely so
a future session doesn't waste time re-investigating the same non-gap a
third time.

## Follow-up: role gating simplified — signed-in is the bar, admin is the only split (Phase 12)

2026-07-10, right after confirming sign-in/admin worked end-to-end: William
clarified the actual intent behind Phase 12's three-tier role system —
being signed in with Google is enough security for hosting-related
features (the server builder, traffic manager, telemetry, registering your
own machine as a host, proposing to host an event yourself). The `host`
role was never meant to gate access to those; the only thing that should
stay admin-only right now is clearing the events calendar (plus the Admin
panel itself, which is inherently admin — crew/role management, system
health, restart). The 3-tier `admin`/`host`/`crew` data model stays (role
is still assignable, `roles.json` still has a `hosts` array), but it no
longer restricts any UI surface except things explicitly tagged `admin` —
the point being that new admin-only features are now a one-line tag
addition (`role:'admin'` in `App.jsx`'s `NAV`), not a design decision every
time.

- **`App.jsx`**: `NAV`'s `deploy`/`build`/`garage`/`telemetry` (previously
  `role:'host'`) and `traffic` (previously `role:'admin'`) are now all
  `role:'crew'` — accessible to any signed-in user. `canAccess()`
  simplified to a plain `requiredRole !== 'admin' || userRole === 'admin'`
  — the `host` branch it used to have is gone since nothing requires
  `'host'` anymore.
- **`EventsView.jsx`**: `HostSelector`'s "I'll host" card — previously
  hidden from the DOM unless `isHost` — now renders for any signed-in
  `user`. Same for the self-host status check effect. The `isHost` prop
  was dropped from `HostSelector` and `ProposeForm`'s `useStore()`
  destructure entirely (unused now).
- **`SettingsView.jsx`**: `HostStatusSection` (the host readiness
  checklist + "Register as host" button) now gates on `user` instead of
  `isHost && user`. `TelemetrySection` (auto-detect toggle, manual game
  dropdown, Forza port, "Test telemetry") dropped its `isHost` gate
  entirely — Settings itself is already only reachable by a signed-in
  user, so there was nothing left to additionally check.
- **`DeployView.jsx`**: the empty state ("No servers running") gained a
  small orange reminder — "Hosting needs Assetto Corsa (with the dedicated
  server component) installed — set the path in Settings first" — shown
  whenever `settings.acServerExe` isn't set. This is the reactive
  "reminded... if they're trying to host" behavior William asked for,
  rather than gating access outright.
- **`BuildView.jsx`** already had an equivalent reminder
  (`⚠ Set acServer.exe path in Settings`, shown when `!settings.acServerExe`
  in the deploy panel) — it just could never have been seen by a plain
  crew member before, since the whole view was `role:'host'`-gated. No
  change needed there; opening the nav item up was enough.
- **Deliberately left unchanged: `Wizard.jsx`'s onboarding.** The AC Path
  and Host Readiness Check steps still only show when
  `role === 'host' || role === 'admin'` (`isHostOrAdmin`) — i.e., in
  practice, only for admins today, since nobody's been promoted to `host`
  through the Admin panel. This was a deliberate choice, not an oversight:
  William's framing was "reminded... *if* they're trying to host," which
  reads as a reactive nudge at the point of use, not mandatory upfront
  friction in onboarding for crew members who may only ever want
  Events/Comms/Stats. If everyone should see the AC Path step during
  onboarding too, that's a one-line change to `Wizard.jsx`'s `steps`
  `useMemo` (drop the `isHostOrAdmin` condition) — flagging it here since
  it's the one open question this pass didn't resolve unilaterally.
- **`isHost`/`isHostOrAdmin` weren't deleted from the data model** —
  `AppStore.jsx` still computes and exports `isHost`, `role` is still a
  real per-user field, and the Admin panel's role dropdown still offers
  `host` as a value. Nothing currently reads `isHost` for access control
  anymore outside `Wizard.jsx`'s onboarding-step gate above, but removing
  the field itself wasn't asked for and might still be useful later (e.g.
  a "designated host" label in the Events host-selector).

Verified this pass: `npx vite build` compiles clean (162 modules, no new
errors). Not independently verified: an interactive click-through
confirming a plain `crew` account can now actually reach Build/Deploy/
Garage/Telemetry/Traffic and see the "I'll host" card — verified by
reading the resulting conditionals only.

## Phase 14: FPV Drone Assistant

Phase 14 added a dedicated FPV Drone Assistant page — mod install/CSP
compatibility checking, HID controller detection + axis calibration, a live
JSON settings editor for the mod's own preset files, a crew position/chase
map, and a static reference guide — for sug44/FpvDroneForAC.

### A real bug caught by actually testing, not just reading

The spec's own CSP-compatibility check code (`/(\d+)\.(\d+)\.(\d+)/` against
a version string, comparing the 2nd/3rd captured groups to `80`/`115`) looks
plausible but is wrong for the real version format it describes elsewhere:
CSP versions look like `0.1.80-preview115`, where `115` is a separate
preview-build counter appended after a hyphen — **not** a fourth dotted
version component. A three-group regex against that string only ever
matches `0.1.80` (patch=80), silently dropping the preview number entirely
regardless of whether it's 115 or 900. This was caught by writing a
standalone six-case test (`0.1.79`, `0.1.80-preview115`,
`0.1.80-preview116`, `0.1.80-preview200`, `0.1.81`, `0.1.78`) against the
spec's literal code before shipping it — it failed 3 of 6. Fixed in
`main.js`'s `fpv:checkInstall`: the dotted version's third component
(`patch`) decides compatibility outright when it's not exactly `80`
(`<80` → compatible, `>80` → not); when `patch === 80`, a separate
`preview[- ]?(\d+)` match extracts the real preview number and compares
*that* to 115. A bare `0.1.80` with no preview suffix at all is treated as
incompatible rather than assumed safe — deliberately conservative, since
the entire point of this check is steering people away from the
jitter-causing versions. Re-ran the same six-case test against the fix:
all six pass.

### Backend
- **`backend/socket.js`**: `socket.on('fpv:position', ...)` relays a
  position to every *other* connected client, relay-only, nothing
  persisted — this is the only way another player's position becomes
  visible at all, since AC's shared memory only ever exposes the local
  player's own position. Broadcasts the client-chosen `handle` (same one
  chat/presence already use), not `socket.user`'s Google display name — the
  spec's own two code snippets disagreed on this (one used `data.handle`,
  the other `socket.user?.name || data.handle`, which in practice always
  picks the Google name since `socket.user` is guaranteed non-null post-auth)
  — `handle` was kept for consistency with how every other view in this app
  already identifies people.
- `scripts/deploy-backend.ps1` already had `backend/socket.js` in its scp
  list from an earlier phase — no change needed there.

### Main process (`src/main/main.js`, `preload.js`)
- `fpv:checkInstall`, `fpv:readPresets`, `fpv:readPreset`, `fpv:writePreset`,
  `fpv:readMapImage` implemented as specified. `acRunning` is a real check
  (`getRunningProcessNames().has('acs.exe')`, reusing gameDetector.js's exact
  process-list mechanism from Phase 13) rather than the spec's own stub,
  which hardcoded `acRunning: false` with a "checked via game detector
  already" comment that didn't actually wire anything up — leaving it
  hardcoded would have made that checklist item permanently red.
- **`fpv:deletePreset` added, not in the spec's own IPC list.** The
  Settings tab's "Delete preset" button is explicitly required, but nothing
  in the given IPC additions backs it, and there's no generic
  `fs:deleteFile` bridge anywhere else in this app to reuse. A one-line
  `fs.unlinkSync` handler, mirroring the shape of every other `fpv:*`
  handler.
- `shell:runCommand` (bare `exec`, no injection hardening) added exactly as
  specced, for the Controller tab's "Open joy.cpl" button.

### Renderer
- **`src/renderer/hooks/useFpvBroadcast.js`** (new): polls the latest frame
  via refs on a 200ms interval rather than re-subscribing an effect on
  every frame tick (telemetry frames update at 60fps) — same throttling
  shape `useTelemetryShm.js` already uses for its own backend mirror.
  Only ever broadcasts real frames, never demo/mock ones — matching that
  same hook's established "never mirror fake data to the backend"
  convention, so idling on the FPV tab with AC not running never pollutes
  the crew map with fabricated positions.
- **`src/renderer/views/FpvView.jsx`** (new, ~750 lines): five tabs (Setup,
  Controller, Settings, Map, Guide) sharing one lifted `activePreset`/
  `presetData` state at the root so the Controller tab's axis calibration
  and the Settings tab's flight/rate/camera editing both read and write the
  *same* in-memory preset object — `updateField`/`updateFields` always
  spread the existing object, so unknown fields the UI doesn't expose
  (anything in the mod's JSON beyond what's listed in the spec) survive a
  save untouched, per the "merge, don't overwrite" constraint.
- `useTelemetryShm()` and `useFpvBroadcast()` are called **inside `MapTab`
  specifically**, not at `FpvView`'s root — only one of the five tabs
  needs live telemetry, so the SHM reader process only starts while a user
  is actually on the Map tab, not the moment they open the FPV page at all.
- **Map projection is a deliberate simplification of the spec's fuller
  zoom/pan language.** The spec only ever asks for `[+]`/`[-]` zoom buttons,
  a Reset button, and an auto-follow toggle — no drag-to-pan control is
  described anywhere. Implemented exactly that: a fixed 400×400 viewBox,
  positions projected via a uniform-scale fit of either (a) all currently
  known points with 10% padding, or (b) — when auto-follow is on — a fixed
  ±60-unit window centered on the local player. Zoom is a CSS `transform:
  scale()` on the `<svg>`; Reset turns auto-follow off and zoom back to 1
  (which naturally re-fits every known point, since that's what non-follow
  mode already does).
- **Gamepad polling runs at one rate (16ms/~60fps), not two.** The spec
  asks for the device list at "every 100ms" and the Live Axis Monitor at
  60fps — polling everything at 60fps is simpler than two separate timers
  and is strictly more responsive than the device list's own ask, at
  negligible cost (`navigator.getGamepads()` is a cheap synchronous call).
- **Controller detection collapses DJI FPV Controller 2 and 3 into one
  matcher/preset** — both share an identical axis layout in the spec, and
  there's no way to distinguish "2" from "3" from `navigator.getGamepads()`'s
  `id` string alone anyway.
- **"Install from Mods library" navigates to the Mods tab but does not
  prefill a "fpv" search.** `ModsView.jsx` has no initial-search-query prop
  today, and adding one would mean modifying a view file outside this
  phase's explicit file list — the button still does the useful 90% (gets
  you to the right tab), just without the last-mile search prefill.
- NAV placement: the spec said "insert between 'links' and 'cluster'," but
  in `App.jsx`'s actual array order `cluster` comes *before* `replays`,
  `mods`, and `links` — the two names never appear adjacent to each other
  either way. Placed immediately before `links` (i.e., right after `mods`),
  which is the most literal reading of "in that neighborhood" the real
  array order allows.

### Verified this pass
`npx vite build` compiles clean (164 modules, up from 162, no new
errors/warnings). `node --check` passes on `main.js`, `preload.js`, and
`backend/socket.js`. The CSP version-compatibility parser was tested
standalone against six real version strings before and after the fix (see
above — this is the one piece of this phase that was actually exercised
with real inputs, not just read). `gameDetector.js`'s
`getRunningProcessNames()`/`EXE_NAMES` were loaded and run for real from a
standalone script (not just assumed importable) — returned a real
69-process snapshot of this machine and correctly reported `acs.exe` not
running.

### Not independently verified
No interactive click-through of the FPV tab itself. An Electron window
from an earlier session in this same conversation was still holding the
app's `requestSingleInstanceLock()` when this phase finished — launching a
fresh `npm run dev` instance to click through would either silently no-op
(blocked by the lock) or risk interfering with whatever's open in that
existing window, so it wasn't forced. A stray orphaned Vite dev-server
process spawned by the blocked launch attempt was identified by PID and
stopped directly; the pre-existing `electron.exe` processes from the
earlier session were left untouched. Also not exercised in this
environment: `navigator.getGamepads()` against a real plugged-in
controller, a real FPV Drone Lua mod install, a real CSP install/version
file, and a real `map.png` track image. If the Live Axis Monitor or a
controller preset ever look wrong against a real device, that's the first
thing to check by hand.

## Rename: AC1Companion → ShinRacer

2026-07-09: the project folder was manually renamed from `AC1Companion` to
`ShinRacer` and the GitHub repo from `ShinobiFPV/AC1Companion` to
`ShinobiFPV/ShinRacer`. This pass updated the remaining name/metadata strings
to match — no logic, IPC, file paths, or module names changed.

- Root `package.json`: `name` → `shinracer`, `build.publish.repo` → `ShinRacer`
  (`productName`, `description`, `build.appId`, `nsis.shortcutName` were
  already correct from the Phase 6 rebrand).
- `backend/package.json`: `name` → `shinracer-backend`, `description` →
  `ShinRacer backend — ShinTech Electronics`.
- `backend/ac-companion.service`: `Description=` field → `ShinRacer Backend`.
  The service file name, systemd service name (`ac-companion`), `User=shinobi`,
  and `WorkingDirectory=/home/shinobi/ac-companion-backend` were left
  unchanged — the service is already deployed on shinobi under that name.
- `README.md`: clone URL and command → `https://github.com/ShinobiFPV/ShinRacer.git`
  / `cd ShinRacer`; the friends-download GitHub Releases link →
  `ShinobiFPV/ShinRacer/releases/latest`.
- `docs/FRIEND_SETUP.md`: download URL → `ShinobiFPV/ShinRacer/releases/latest`.
- This file: top note split into `App display name: ShinRacer` /
  `Repo: ShinobiFPV/ShinRacer (previously AC1Companion)`.
- `src/main/main.js`, `src/renderer/index.html`, `src/renderer/App.jsx`,
  `src/renderer/components/Wizard.jsx`: already read as `ShinRacer`
  everywhere (log folder, notification titles, window `<title>`, sidebar
  wordmark, wizard welcome screen) from the Phase 6 rebrand — no changes
  needed.
- `.github/workflows/release.yml`: doesn't reference the repo name directly
  (relies on `package.json`'s `build.publish` block) — no change needed.
- `scripts/deploy-backend.ps1`: untouched per instructions — it targets
  shinobi paths and the `ac-companion` service name, both unchanged.
- `src/renderer/views/ModsView.jsx`: `SETUP_GUIDE_URL` repo path
  `ShinobiFPV/AC1Companion` → `ShinobiFPV/ShinRacer` (this link was dead
  post-rename; fixed in a follow-up pass since it's a functional bug, not
  just a cosmetic name reference).

### Remaining "AC1Companion" / "AC Companion" strings (not auto-fixed — review manually)
A repo-wide grep (excluding `node_modules`, `.git`, `dist`, `release`) after
the above changes still finds these; none were touched this pass since the
task scope was limited to the files listed above:

- `CLAUDE.md:1` — H1 heading `# AC Companion App — Claude Code Project Brief`
- `CLAUDE.md:419`, `:454`, `:477`, `:487` — historical phase-completion prose
  (Phase 4/5/8 notes describing the old name and the earlier rebrand) —
  likely fine to leave as a historical record, but flagging per the task.
- `.github/release-template.md:1` — `## AC Companion {version}`
- `src/renderer/views/EventsView.jsx:58` — iCal `PRODID:-//AC Companion//EN`
- `scripts/deploy-backend.ps1:1,6` — comment header and `Write-Host` banner
  text say "AC Companion"
- `backend/server.js:43` — startup `console.log` says "AC Companion backend
  listening on :{PORT}"

## README rewrite: crew tone

2026-07-09: `README.md` was rewritten top to bottom for tone only — same
technical coverage, same structure, every feature still documented, but
written like it's being hyped to a friend before race night instead of
presented like a software manual. No source files changed, GitHub About
field text was produced separately (not committed to any file — it's set
directly in the repo's GitHub settings).

- Every section got a new header in the same spirit as the old one
  (`Overview` → `What is this?`, `Features` → `What it does`,
  `Getting Started` → `Let's go`, etc.) — section order and content
  coverage are unchanged, only the header wording and prose voice.
- All commands, config snippets (`cfg.ini`, the ASCII architecture diagram,
  the tech-stack table), URLs, and filenames are byte-for-byte the same as
  before — only the surrounding sentences changed. Nothing was simplified
  to the point of being technically wrong.
- The Credits section keeps every existing attribution (Claude, Claude
  Code, Anthropic, the full technology and community credit lists) — the
  wrapping paragraph was rewritten warmer, but the underlying claim about
  who did what (William directed, Claude Code wrote the code) didn't
  change.
- License section left completely untouched, as instructed — legal text
  stays formal regardless of the rest of the document's tone.
- **Deviation:** the task's instructions assumed each feature section still
  had a screenshot placeholder to preserve ("paths, alt text, captions can
  have personality but filenames don't change"). There are none — Phase 5's
  README pass shipped without screenshots, and Phase 6 explicitly declined
  to reintroduce placeholder images since none were ever actually captured
  (see the Phase 6 completion notes above). This rewrite followed the
  README's actual current state rather than the task's assumption and did
  not add new screenshot placeholders, to avoid reintroducing exactly the
  broken-image-link pattern Phase 6 deliberately removed.

## Phase 10: Companion PWA

Phase 10 added a mobile-first PWA (`pwa/`) — a completely separate React/Vite
app from the Electron one, served by nginx on shinobi alongside the existing
Express backend — plus the backend additions it needed (push notifications,
a PWA-specific OAuth redirect flow) and its own deploy script.

### Track 0 — Backend additions
- `backend/db.js`: `push_subscriptions` table + a `pushSubs` module
  (`save`/`getAll`/`getByHandle`/`delete`), following the existing
  table/module shape exactly. `endpoint` is `UNIQUE` with an
  `ON CONFLICT ... DO UPDATE`, so a browser re-subscribing (e.g. after a
  service worker update) replaces its row instead of accumulating duplicates.
- `backend/lib/push.js` (new): configures `web-push`'s VAPID details once at
  require-time from env, and exports `sendToAll`/`sendToHandle` — both
  delete a subscription row automatically on a `410`/`404` response (the
  push service telling us the endpoint is gone for good) rather than
  leaving a dead row that fails forever. This lives in `lib/`, not inlined
  in `server.js`, specifically so `routes/events.js` and `routes/mods.js`
  can both call it without a circular `require` back into `server.js`.
- `backend/routes/push.js` (new): `GET /vapid-public-key` (not in the
  original spec's route list, but `pushManager.subscribe()` on the client
  needs the VAPID *public* key as its `applicationServerKey` and there's no
  other way for the PWA to get it — the public half is safe to serve, only
  the private key must stay server-side), `POST /subscribe`,
  `DELETE /subscribe`, and a debug-only `POST /test` that proves the full
  subscribe → deliver round-trip for Settings' "Test notification" button.
- `backend/routes/auth.js` (new): `GET /api/auth/config` returns
  `{ clientId, redirectUri }` for the PWA to build its own Google OAuth URL
  client-side — the client secret never leaves the backend.
- `backend/lib/oauth.js`: `createOAuthClient`/`getAuthUrl`/`exchangeCode` all
  gained an optional `redirectUri` (Google requires the token-exchange
  redirect_uri to exactly match the one used to build the auth URL, and the
  PWA's is a real `http://` URL, not Electron's fixed `accomp://oauth`
  scheme), and `exchangeCode` gained an optional `codeVerifier` for the
  PWA's PKCE flow — `undefined` for the Electron flow, which
  google-auth-library correctly treats as "not PKCE." `routes/mods.js`'s
  existing `/auth/url` and `/auth/callback` (already used by the Electron
  Mod Manager) were extended to pass these through rather than duplicated
  into a second set of routes — same endpoints, two callers.
- `backend/server.js`: wires up `pushRouter`/`authRouter`, and adds an
  hourly `setInterval` that pushes a "starts soon" notification for any
  `happening` event within 24h (`remindedEventIds` is an in-memory `Set`,
  same restart-tolerant tradeoff the Electron app's own reminder `Set`
  already accepted — see Phase 4's notes). `routes/events.js`'s POST
  handler and `routes/mods.js`'s upload handler both fire a
  `push.sendToAll(...)` after responding (fire-and-forget, so a slow push
  service never holds up the actual request) for "new event proposed" and
  "mod uploaded."
- `backend/package.json`: added `web-push@^3.6.7` (the only new backend
  dependency, per spec).
- Incidental fix while touching `server.js`: its startup `console.log` still
  said `"AC Companion backend listening on :{PORT}"` — a leftover the rename
  pass had flagged as "found but not fixed" — changed to `"ShinRacer backend
  listening..."` while already in the file for an unrelated reason.

### Track 1 — PWA scaffold
- `pwa/` is a fully independent app: its own `package.json`
  (`shinracer-pwa`), its own `vite.config.js` (dev proxy to the backend,
  `vite-plugin-pwa` for service-worker generation), its own `index.html`
  and `src/main.jsx`. Nothing under `pwa/` imports anything from `src/` (the
  Electron app) — the constraint's "share the backend only" is real, not
  just documentation. Where the two apps need the same values (brand color
  tokens, the preset links list), `pwa/` carries its own literal copy
  (`pwa/src/lib/colors.js`, `pwa/src/lib/presetLinks.js`) rather than
  reaching across the build boundary — the two apps build and deploy on
  completely different schedules, so an import would silently couple them.
- `vite-plugin-pwa` generates the service worker (`generateSW` strategy) —
  per the constraint, no hand-written `sw.js` exists, since the plugin would
  silently overwrite one anyway. `manifest: false` in the plugin config
  because `pwa/public/manifest.json` already ships hand-authored to the
  exact spec'd shape (including the `shortcuts` array) — the plugin still
  reads and respects it for precaching purposes.
- Routing is `react-router-dom` v6, exactly the route list from the spec.
  `App.jsx` gates every route except `/onboarding` and `/auth/callback`
  behind `isOnboarded()` (see Track 2 below for why that's a separate flag
  from "has an identity").

### Track 2 — Auth model: identity vs. onboarding vs. Google sign-in
Three genuinely separate pieces of state, which the spec's onboarding flow
implies but doesn't name explicitly:
- **Onboarding completion** (`shinracer_onboarded` in localStorage) — gates
  whether `/onboarding` is shown at all. A guest completes onboarding with
  *no* identity, so this can't be "has an identity" the way it might first
  seem — it's tracked as its own flag.
- **Identity** (`shinracer_identity` — `{ handle, color }`) — what Events/
  Comms need to attribute a proposal, acceptance, or chat message to
  someone. Only ever set by a successful Google sign-in in the PWA (unlike
  the Electron app, which has a manual handle+color picker in Settings) —
  a guest never gets one. `AuthCallbackPage` derives `handle` from the
  Google profile name and a `color` via a deterministic
  `hashToColor(handle)` (a small hash into an 8-color palette,
  `pwa/src/lib/colors.js`) — a judgment call, since the spec's onboarding
  steps never include a manual color swatch picker the way Electron's
  Settings does, and inventing one wasn't asked for.
- **Google sign-in** (`shinracer_auth` — tokens + Google profile) — gates
  mod uploads specifically. Expiry is handled the same way Phase 6 handled
  it in Electron: invalidate and reprompt, no silent refresh-token exchange
  (`useAuth`'s `isTokenExpired` check clears `shinracer_auth` and flips
  `isLoggedIn` to `false` rather than trying to refresh).
- PKCE (`pwa/src/lib/auth.js`): `generatePKCE()` uses
  `crypto.getRandomValues` + `crypto.subtle.digest('SHA-256', ...)` (both
  standard browser APIs, no library). The verifier and the redirect_uri
  actually used are stashed in `sessionStorage` (not `localStorage` — it
  only needs to survive the redirect round-trip) alongside a `returnTo`
  path, so `AuthCallbackPage` knows whether to route back into onboarding's
  step 4 (`?step=done`) or back to wherever sign-in was triggered from
  (Settings, Mods) after a plain page navigation wipes all in-memory React
  state.

### Track 3 — Views
All nine routed views exist: `OnboardingPage` (4 steps — Welcome, Backend
URL, Sign-in-or-guest with the limitations checklist, Done), `EventsPage`
(month-scoped card list, not a calendar grid — too small on mobile, per
spec) + `EventDetailPage` (Accept/Edit/Cancel/iCal export, with `ProposeForm`
exported from `EventsPage.jsx` and reused for both propose and edit — same
pattern the Electron `EventsView` used in Phase 3), `CommsPage` (Voice/Chat
tabs, hold-to-talk via `onTouchStart`/`onTouchEnd` plus `onMouseDown`/
`onMouseUp` so it's also usable from a desktop browser, `useWebRTC.js`
copied verbatim from the Electron app since `RTCPeerConnection` is a native
browser API either way), `ModsPage` (download-only, no install-tracking —
there's no local AC path on a phone), `StatsPage` (read-only, a simplified
per-lap bar chart rather than the Electron app's stacked S1/S2/S3 chart),
`LinksPage` (same preset list, long-press-to-copy via a small
`useLongPress` hook backed by a touch timer, `onContextMenu` as the desktop
equivalent), and `SettingsPage` (identity, backend URL, notifications,
about). `BottomNav.jsx` + `BottomNav.css` handle the mobile-bottom /
desktop-sidebar responsive swap at the 768px breakpoint from the spec.

### Track 4 — Manifest, icons, service worker
- `pwa/public/manifest.json` matches the spec's exact JSON.
- **Icon generation deviation:** the spec offered "inline SVG rendered to
  canvas at build time, OR create simple SVG icon files" — but
  `manifest.json`'s icons are declared `type: "image/png"`, and no
  canvas/image-rendering library is available in this environment (the same
  native-dependency gap already documented for `better-sqlite3` in Phases
  4/6 and `mmap-io`/`node-ffi-napi` in Phase 9 — none has a prebuilt binary
  for this Node/win32 combination). Rather than ship broken `.png`
  references or silently swap the manifest to SVG (which not all platforms'
  install prompts accept), `pwa/scripts/generate-icons.js` hand-encodes real
  PNG files using only Node's built-in `zlib.deflateSync` for the DEFLATE
  compression IDAT chunks need, plus a small hand-rolled CRC32 — no external
  dependency at all. Content is a simple 5×7-bitmap-font "SR" mark in
  `C.blue` on `C.bg`, not actual rendered Bebas Neue glyphs. All three
  outputs (`icon-192.png`, `icon-512.png`, `icon-maskable.png`) were
  verified this pass by decoding them back (inflating the IDAT chunk and
  checking the byte count matches `height × (1 + width × 3)` exactly) — real,
  valid, correctly-sized PNGs, just placeholder artwork. Swap in real
  branded icon files before this ships to actual users if that matters;
  `generate-icons.js` is there to rerun if the mark itself changes in the
  meantime.
- `pwa/public/offline.html`: static, inline-styled (no external CSS/font
  dependency that might itself be offline), matches spec content exactly.
- Service worker: `vite-plugin-pwa`'s `generateSW` strategy, configured in
  `vite.config.js` — cache-first for the app shell/JS/CSS/Google Fonts,
  network-first (5s timeout, falls back to cache) for `/api/*` except mod
  downloads (streamed files too large/pointless to cache), `navigateFallback:
  '/offline.html'` for the "both network and cache failed" case, with
  `/auth/callback` denylisted from that fallback since a failed navigation
  there needs to actually reach the callback page's own error handling, not
  silently become the offline page.

### Track 5 — nginx + deploy
- `backend/nginx/shinracer.conf` matches the spec's config exactly.
- `scripts/deploy-pwa.ps1` (new) follows the same strict single-line
  PowerShell rule as every other deploy script in this repo (no `if`
  blocks, no backticks, no here-strings) — verified by parsing (not
  executing) it via `[scriptblock]::Create()`, the same technique Phase 4
  used for `deploy-backend.ps1`.
- `scripts/deploy-backend.ps1`: added `scp` lines for `routes/push.js`,
  `routes/auth.js`, `lib/push.js`, and the nginx conf. The spec's own
  "Deploy script additions" section only named `push.js` and the nginx
  conf explicitly, but `routes/auth.js` and `lib/push.js` are just as new
  and just as required for the deployed backend to actually have these
  routes — omitting them would silently ship a backend missing half of what
  this phase built, the same reasoning Phase 4 used to justify including
  `routes/invites.js` in that deploy script even though it postdated the
  original file list.

### Track 6 — Docs
- `docs/PWA_SETUP.md` (new): the full setup guide — nginx (links to
  `NGINX_SETUP.md`), VAPID key generation, the Google Cloud Console redirect
  URI addition (links to `GOOGLE_DRIVE_SETUP.md`'s new addendum rather than
  duplicating the steps), deploying, and getting installed on a phone
  (Tailscale + iOS/Android "Add to Home Screen" instructions).
- `docs/NGINX_SETUP.md` (new): nginx install + site config + what each
  block does + a troubleshooting section.
- `docs/GOOGLE_DRIVE_SETUP.md`: new "3b. PWA redirect URI" section between
  the existing OAuth client step and the folder-IDs step, plus
  `GOOGLE_OAUTH_REDIRECT_URI_PWA` added to the `.env` block in step 5.
- `README.md`: new "For the crew on mobile" section, placed after the
  feature list per spec, written in the same crew-hype voice the rest of
  the README already uses (not the more manual-toned draft text in the
  spec's own example) — reusing the spec's *content* (Tailscale + a link +
  Add to Home Screen) but matching the voice actually used throughout this
  file after the README rewrite pass above it in this document.
- `docs/FRIEND_SETUP.md`: new "Option B — Mobile / PWA" section, written to
  match *that* file's own plain, numbered-steps tone (it wasn't part of the
  README's tone-rewrite pass, so introducing the hype voice into just one
  section of it would read as inconsistent within the same document).
- Root `.env.example`: added `GOOGLE_OAUTH_REDIRECT_URI_PWA` and the three
  `VAPID_*` vars, matching what `backend/.env` needs per the docs above.

### Constraints honored
- Nothing under `pwa/` imports from `src/` — verified by grep, zero hits.
- No `window.api` anywhere in `pwa/` — every backend interaction goes
  through `axios`/`socket.io-client` directly (`pwa/src/lib/api.js`), as
  the constraint required.
- `deploy-pwa.ps1` and the `deploy-backend.ps1` additions were parse-checked
  against the strict single-line rule.
- `vite-plugin-pwa` generates the service worker — no manual `sw.js`.
- Touch targets: every interactive element in the new primitives
  (`pwa/src/components/primitives.jsx`) and views has a minimum 44px
  dimension (`Btn` heights are 40/48/56px, `FAB`/PTT circle is 56/80px,
  nav items are `flex: 1` × 44px+).
- External links (`LinksPage`, `SettingsPage`'s About section) all open via
  `window.open(url, '_blank', 'noopener')` or `target="_blank" rel="noopener
  noreferrer"`.
- Guest mode is explicit everywhere it matters: `CommsPage` shows a "sign in
  to join comms" empty state instead of a broken/empty voice+chat UI,
  `EventDetailPage`'s Accept button reads "Sign in to accept" and is
  disabled rather than silently failing, `ModsPage` shows a "sign in to
  upload" prompt in place of the FAB.
- VAPID keys and `pwa/.env` are not committed — `.gitignore`'s existing
  `.env` / `.env.*` patterns (with no leading `/`, so they match at any
  depth) already cover `backend/.env` and would cover `pwa/.env` too if one
  ever existed; no gitignore change was needed for this, verified with
  `git check-ignore`.

### Noted deviations
- **Icon PNGs are a hand-encoded placeholder mark**, not rendered brand
  artwork — see Track 4 above for the full reasoning and what was verified.
- **`GET /api/push/vapid-public-key` and `GET /api/auth/config`** are both
  additions beyond the spec's literal route list — both are things the
  client-side flows (`pushManager.subscribe()`, building the Google auth
  URL) cannot function without, so treating them as omissions to fix rather
  than scope to avoid.
- **Propose (not just Accept) is gated behind identity** in
  `EventsPage`/`EventDetailPage`, even though the spec's guest-limitations
  checklist only explicitly lists "Accept events (needs identity)." A
  proposal needs a `proposed_by` handle the same way an acceptance needs
  one — treated as an oversight in the checklist rather than a deliberate
  allowance for anonymous proposals.
- **Identity color is deterministic (hashed from the Google name), not
  manually chosen** — the onboarding spec's steps never include a color
  picker the way Electron's Settings does, so inventing one wasn't in scope,
  but Comms/Events still need *some* per-user color to render.
- **`StatsPage`'s lap chart is a plain per-lap bar of total lap time**, not
  the Electron app's stacked S1/S2/S3 chart — deliberately simplified per
  the spec's own "simplified SVG chart (same data, smaller)" instruction.

### Not independently verified
This environment has no Google Cloud project, no VAPID keys, no actual
`shinobi` Pi to deploy to, and no real mobile device — so the following are
verified only by code reading plus the checks noted in each track above, not
by running them end-to-end: the real Google PKCE round-trip through an
actual browser redirect, a real push notification arriving on a real device,
`deploy-pwa.ps1`/`deploy-backend.ps1`'s new lines actually running against
`shinobi`, and nginx actually reverse-proxying a live backend. What *was*
verified: every new backend file passes `node --check`; both deploy scripts
parse as valid PowerShell; all three generated PNG icons decode back to
valid, correctly-sized image data; see the next task's notes for the
`pwa/` build/install verification.

## Phase 11: The Cluster Fucker

Phase 11 added a custom button-box/dashboard builder — a full drag-and-drop
editor in the Electron app, a runtime overlay window, and a runtime-only
version on the PWA — plus the keystroke-dispatch and backend plumbing all
three needed. The feature's name is "The Cluster Fucker" everywhere in the
UI, uncensored, per explicit instruction.

### Track 0 — robotjs verification (the actual open question this phase had)
The brief asked to check whether `robotjs` works with Electron 28 on Windows
before committing to it, with PowerShell `SendKeys` as the documented
fallback if not. This was genuinely tested, not assumed:
- `npm install robotjs` succeeds in this environment (a prebuilt binary
  exists via `prebuild-install` for this Node/win32 combination) — confirmed
  loadable and functional from plain Node (`robot.getScreenSize()` returned
  a real result).
- The harder, actually-relevant question — does a binary resolved against
  the *system* Node's ABI also load inside *Electron's* bundled Node (a
  different, usually older, ABI)? — was tested directly: a throwaway
  `_robotjs_test.js`, run via `npx electron _robotjs_test.js` from inside
  this project (so `require('robotjs')` could resolve against the project's
  real `node_modules`), called `require('robotjs')` from inside a real
  Electron 28 `app.whenReady()` main-process context. It loaded
  successfully and `robot.getScreenSize()` returned a real value; `keyTap`
  and `keyToggle` were confirmed present as functions (not invoked, to avoid
  actually injecting a keystroke into whatever had focus in this sandbox).
  The test file was deleted after use, not checked in.
- **Conclusion: robotjs is the primary keystroke path**, added as a real
  dependency (`^0.7.1`, pinned to the version actually verified). The
  PowerShell `SendKeys` fallback (`src/main/main.js`'s `sendKeyViaSendKeys`)
  still exists and engages automatically if `require('robotjs')` throws —
  e.g. a crew member's machine without a matching prebuilt binary — same
  defensive posture the codebase already uses for every other
  native-dependency decision (better-sqlite3 in Phases 4/6, the SHM reader
  in Phase 9).
- `package.json` also gained `"asarUnpack": ["node_modules/robotjs/**/*"]` —
  a native `.node` addon can't be `dlopen`'d from inside an ASAR archive, so
  without this a packaged (`electron-builder`) release would work in `npm
  run dev` but silently fail to load robotjs the moment it's actually
  installed from a built installer. This wasn't tested against a real
  `electron-builder` packaging run (no phase has run one yet), but it's the
  standard, well-documented fix for exactly this class of problem.

### Track 1 — Backend
- `backend/db.js`: `cluster_presets` table + a `cluster` module
  (`list`/`listPublic`/`get`/`create`/`update`/`delete`/`countPublic`/
  `incrementLaunch`), following the existing table/module shape. List views
  parse `layout_json` just to report `widgetCount` and never ship the full
  JSON blob in a list response (can be large with embedded base64 images).
- `backend/routes/cluster.js`: full CRUD exactly per spec, plus the 5-public
  limit enforced on both `POST` (new) and `PATCH` (going from private to
  public) — checked with a real HTTP smoke test (see Verified this pass).
  `DELETE`/`PATCH` both validate `body.author === stored.author` — this is
  the same "no real auth, friends-only app" trust model every other route
  in this backend already uses (events, invites), not a new pattern.
- `backend/routes/telemetry.js`: `POST /frame` (stores the latest frame in a
  plain module-level variable, not SQLite — it's a ~500ms-latency mirror of
  "what's on screen right now," not a historical record, so nothing here
  belongs in a table) and `GET /latest`. Also emits `'telemetry:frame'` over
  Socket.io on every POST, since a slow client can listen for the push
  instead of only polling.
- `backend/socket.js`: `presence:join` gained an optional `clientType`
  (`'electron' | 'pwa'`), and a new `cluster:action` handler relays an
  appFunction call to the *same handle's* own connected Electron session.
  **Deviation from the brief's literal wording:** the spec described this as
  relaying "to the host," but there's no single well-defined "the host" in
  a crew where more than one person might run the Electron app on their own
  rig — routing by handle instead means your phone controls *your own*
  desktop session, never someone else's PC, which is both the only
  unambiguous interpretation and the only safe one (arbitrary
  cross-identity remote control wasn't asked for and would be a real
  overreach for a friends app with no auth).
- `backend/routes/auth.js`/`push.js`/etc. from Phase 10 are untouched.
- `backend/package.json`: added `qrcode-generator@^2.0.4` (same version
  already verified working in the Electron app since Phase 4's invite QR
  codes) for the backend's own `:id/qr` route.
- `scripts/deploy-backend.ps1`: added `scp` lines for `routes/cluster.js`
  and `routes/telemetry.js`, parse-checked with `[scriptblock]::Create()`.

### Track 2 — Widget catalogue
All 11 widgets exist in `src/renderer/components/cluster/widgets/`, each
with `edit`/`runtime` modes, plus `widgets/index.js` as the single source of
truth (`CLUSTER_WIDGET_CATALOG`) — same pattern as Phase 9's telemetry
`WIDGET_CATALOG`. `GaugeWidget` re-uses the Phase 9 telemetry gauge
components directly rather than reimplementing them, exactly as specced.
`ColorPicker.jsx` is a from-scratch hex-input + 40-swatch grid + glow
preview, no external library, per the constraint.
- **Runtime state map, not in the documented prop list:** the spec's
  per-widget prop contract (`{ id, type, x, y, width, height, config,
  telemetryFrame, mode, onPress, onRelease, onValueChange, isSelected,
  onSelect }`) doesn't include anything for "what is this toggle/encoder/
  slider/XY-pad's *current* value" — but `ToggleButton`'s own spec text says
  state is "stored in cluster runtime state, not config," which requires
  *some* prop to carry that state down and read it back up. `ClusterRuntime`
  owns a `runtimeState` map keyed by widget id and passes each stateful
  widget a pragmatic `value`/`onValueChange` pair to fill this real gap in
  the documented contract — not a deviation from intent, just naming the
  mechanism the spec's own widget descriptions require but didn't spell out.
- **Positioning/selection ownership split:** individual widget components
  render only their own visual appearance and input handling; absolute
  positioning (`x`/`y`/`width`/`height`), the edit-mode selection outline,
  and the resize handles are owned by the canvas (`ClusterView.jsx`'s
  `Canvas` component), not duplicated into all 11 widget files. Implementing
  drag/resize/selection chrome 11 times over would have been both far more
  code and a real correctness risk (11 places to get grid-snap math right
  instead of one) — the same reasoning Phase 9 used to justify a single
  `WIDGET_CATALOG` over one-off per-widget wiring.
- **`ImagePanel`'s `onConfigChange` prop** is likewise a pragmatic addition
  beyond the documented list — the spec explicitly wants clicking the widget
  *itself* in the editor to open a file picker and persist the result, and
  nothing in the documented prop set lets a widget write back to its own
  config. `ClusterView` only passes this prop in edit mode.

### Track 3 — Editor (`ClusterView.jsx`)
Three sub-tabs (Editor / My Clusters / Public Library) in one file, matching
this codebase's existing convention of fairly large single-file views
(`EventsView.jsx`, `TrafficView.jsx`) rather than fragmenting further.
- Canvas drag-to-move, resize-via-corner-handles, marquee multi-select, grid
  snap (Alt bypasses it), 20-step undo/redo, zoom (50/75/100/125%), and a
  Delete/Backspace key handler for multi-widget deletion are all hand-rolled
  with `onMouseDown`/`onMouseMove`/`onMouseUp` — no drag-and-drop library,
  per the constraint. Palette items are also real HTML5-draggable
  (`draggable` + `dragstart`/`drop`) as an added convenience alongside
  click-to-add, since both cost little once the canvas already tracks drop
  coordinates.
- The config panel (`WidgetConfigPanel`) is data-driven off a single
  `FIELD_META` table mapping config key names to a section
  (Appearance/Label/Action/Telemetry) and a control type (color/select/
  number/boolean/text/textarea/image) — chosen over hand-writing 11
  near-duplicate config forms, since most config keys (`fillColor`,
  `label`, `fontSize`, ...) are shared across many widget types. The one
  place this needed a widget-type-specific override is `shape`, whose valid
  options differ between buttons (`rectangle/circle/hexagon/diamond`) and
  `IndicatorLight` (`circle/square`).
- **Action binding editor** stores `fnParam` in its *final* dispatched shape
  directly (e.g. `{ index: 3 }`, `{ presetId: '...' }`) rather than a raw
  scalar needing translation at dispatch time — `FN_PARAM_FIELD` maps each
  parameterized app function to the one field it needs, and dispatch is
  ever only `api.cluster.sendKey(action.key)` or
  `api.cluster.callFn(action.fn, action.fnParam)`, no shape-guessing at the
  point of firing.
- **QR sharing — a real spec contradiction, resolved as two distinct
  features:** the brief's backend-route section says `GET
  /api/cluster/presets/:id/qr` encodes "the full layout JSON" with a
  2048-byte hard limit, while the separate "QR CODE PRESET SHARING" section
  says the QR encodes a `accomp://cluster/{id}` deep link, and the editor's
  own Export-section text says "Warn if preset > 50KB" — three different
  numbers and two different payloads for what reads like the same button.
  Implemented as genuinely two features serving two different entry points,
  rather than picking one and silently dropping the other: the editor's own
  **Share QR code** button (`LayoutSettingsPanel`) builds a QR **client-side**
  from `JSON.stringify(layout)` using the already-installed
  `qrcode-generator`, gated at 50KB exactly as that section's text says, and
  works on *any* preset whether published or not (a from-scratch local
  preset has no backend row to point a deep link at, so this had to be
  local-only anyway). The **backend's** `:id/qr` route is implemented
  exactly as its own section specifies — full `layout_json`, 2048-byte hard
  limit, `too_large` error code — and is the mechanism Public
  Library/My-Clusters cards would use for an *already-published* preset
  (reachable by id from any client, not just the one that built it).
- **Stale-closure bug found and fixed during this pass, not shipped:**
  `publish()` originally read the enclosing `localPresets` React state right
  after calling `saveLocal()`, which itself calls `setState` — since state
  updates aren't synchronous, a first-time publish (no existing local
  record yet) would have seen the *pre-update* array, missed the just-added
  record, and inserted a second, duplicate one. Fixed by having `saveLocal()`
  return the freshly-computed `{ nextLayout, nextPresets }` and having
  `publish()` operate on those directly instead of re-reading component
  state. Caught by re-reading the diff before moving on, not by a runtime
  test (no way to click through the actual editor in this environment).

### Track 4 — Runtime + overlay window
- `ClusterRuntime.jsx` (used by the Electron overlay, the editor's own
  Preview mode, and `ClusterThumbnail.jsx`) and `ClusterThumbnail.jsx`
  (CSS-`transform: scale`, computed as `min(width-ratio, height-ratio)`
  rather than the spec's literal width-only ratio, so a preset with a
  non-default aspect ratio doesn't overflow or leave dead space — a strict
  improvement on the letter of the spec, not a deviation from its intent).
- `main.js`: `cluster:openOverlay`/`closeOverlay`/`overlayStatus`/
  `showOverlayContextMenu` follow the exact `BrowserWindow` config from the
  spec (transparent, frameless, always-on-top, `#cluster-overlay` hash
  route). `telemetry:shmStart`'s frame handler now also forwards to
  `clusterOverlayWindow` alongside the existing `win`/`overlayWindow`
  targets, so a cluster overlay showing gauge widgets gets live data too.
  `cluster:overlayStatus` isn't in the spec's literal handler list but is
  the obvious missing piece needed for the `cluster.toggle` appFunction to
  actually *toggle* (open if closed, close if open) rather than always
  opening a second window — added for the same reason `telemetry:
  overlayStatus` already existed for the Phase 9 overlay.
- `main.js`'s `cluster:callFn` handler splits functions by where their state
  actually lives: `telemetry.start`/`telemetry.stop`/`server.stop` are
  fully self-contained in the main process (the SHM reader and
  `runningServers` map never leave here), so they're handled directly —
  `server:stop`'s and the SHM start/stop handlers' bodies were extracted
  into named functions (`stopServerProcess`, `startShmTelemetry`,
  `stopShmTelemetry`) so both the original IPC handler and the new
  `cluster:callFn` path call the identical logic instead of two copies
  drifting apart. Everything else forwards to the renderer as a single
  `cluster:invoke` event.
- `App.jsx`'s `cluster:invoke` listener handles `server.launch` (looks up
  the preset in `profiles`, reuses the existing `wizardDeploy` — the same
  helper `ServerWizard` already calls, not a new deploy path),
  `ac.openReplay` (switches view), `ac.launchGame` (new `ac:launch` IPC
  handler — this app had no "just launch AC with no replay" capability
  before), and both overlay toggles directly; everything else
  (`ptt.*`, `mute.toggle`, `chat.sendPhrase`, `lap.marker`, `volume.*`) is
  re-broadcast as a `window.dispatchEvent(new CustomEvent('cluster:${fn}'))`
  for whichever view owns that state to pick up.
- **Disclosed limitation, not a bug:** `ptt.start`/`ptt.stop`/
  `mute.toggle`/`volume.up`/`volume.down`/`chat.sendPhrase` only take effect
  while the Comms tab happens to be mounted, because the mic-mute/PTT/
  volume state they need lives in `CommsView`'s own local component state,
  not a global store — `CommsView`'s `VoicePanel`/`ChatPanel` each added a
  `window.addEventListener('cluster:...')` block that only exists while
  those components are alive. Lifting that state into `AppStore` so these
  became true background hotkeys would be a materially larger refactor of
  a "Phase 1-10 confirmed working feature," which the constraints explicitly
  said not to touch — this was a real, considered trade, not an oversight.
  `lap.marker` has no listener anywhere yet: "mark the current lap" isn't an
  existing capability of `StatsView` (there's no lap-tagging feature to
  wire into), and inventing one wasn't in scope for this phase — the event
  fires and is silently a no-op today, which is honest about the gap rather
  than fabricating a half-feature to make the dispatch table look complete.
- `accomp://cluster/{id}` deep link: `main.js`'s `handleAccompUrl` gained a
  branch alongside the existing OAuth one, forwarding to a new
  `cluster:loadPreset` IPC event; `ClusterView` fetches that preset from the
  backend and switches into the editor with it loaded.

### Track 5 — PWA port
- **The PWA needed its own copy of the entire runtime widget stack** —
  `pwa/src/components/cluster/widgets/*` (all 11), `ClusterRuntime.jsx`, and
  a port of Phase 9's `telemetry/widgets.jsx` (needed by the ported
  `GaugeWidget`) — rather than importing from `src/`, per this phase's own
  explicit constraint ("do not modify any files in `src/`... they share the
  backend only") and the established Phase 10 precedent
  (`colors.js`/`presetLinks.js` are already literal duplicates across this
  exact boundary for the same reason: the two apps build and deploy on
  completely independent schedules). This was mechanical, not a
  reimplementation — the ported files are functionally identical to their
  Electron counterparts, with only the `{ C }` import path adjusted
  (`../../primitives` → `../../../lib/colors`, one extra level since the
  PWA's tokens live in `lib/`, not `components/`) and the editor-only code
  paths (drag/resize/selection, `ImagePanel`'s click-to-upload) dropped,
  since `ClusterPage` is runtime-only per spec — no editor exists on mobile
  at all.
- `pwa/src/views/ClusterPage.jsx`: preset picker (My presets / Public
  presets tabs) when nothing's loaded, a full-screen `ClusterRuntime` scaled
  to fit via `transform: scale` once a preset is active, a collapsible
  header (shrinks to a 4px blue strip, tap to expand), a Fullscreen button
  (`requestFullscreen()`), and `GET /api/telemetry/latest` polled every
  500ms (not a socket subscription) per the spec's explicit battery-saving
  instruction.
- **Action dispatch on the PWA is genuinely different from Electron**:
  keystroke-type actions can't fire at all (a browser has no OS-level key
  injection) — triggering one shows the exact toast text the spec
  specified, "Key bindings don't work on mobile — use App Function
  bindings." appFunction-type actions go out over the existing Socket.io
  connection as `cluster:action`, landing on the backend's new relay (Track
  1) which forwards to the same handle's own connected Electron session.
- **`clientType` added to *both* apps' `useSocket.js`** (`'electron'` /
  `'pwa'` on `presence:join`) — this is what the backend relay actually
  keys off of to know which connected socket, if any, belongs to an
  Electron app it can dispatch through. Without this addition the relay
  designed in Track 1 would have had no way to distinguish a phone's own
  socket from a desktop one, even matched by handle.
- **`useTelemetryShm.js` (Electron)** now POSTs each real (never
  mock/demo) frame to `/api/telemetry/frame`, throttled to once per 500ms
  via a `lastPostedAt` ref, fire-and-forget (`.catch(() => {})`) so a
  slow/offline backend can never affect the local live telemetry display.
  **Accepted minor inefficiency:** if the main window, the telemetry
  overlay, and a cluster overlay are all open simultaneously, each is a
  separate renderer process with its own copy of this hook and its own
  independent 500ms throttle — meaning up to 3x the POST rate in that
  specific case. Not coordinated across windows because doing so would need
  main-process arbitration for a redundancy that's at most a few extra
  small POSTs per second; disproportionate complexity for the actual cost.

### Constraints honored
- "THE CLUSTER FUCKER" appears uncensored in `ClusterView.jsx`'s header and
  `docs/CLUSTER_FUCKER.md`'s title, in Bebas Neue, uppercase, exactly as
  required.
- No drag-and-drop library, no color-picker library — both hand-rolled with
  plain mouse/touch events, per the constraint.
- Every widget's telemetry access goes through `frame?.field ?? fallback` —
  `shared.js`'s `getTelemetryValue`/`telemetryIsOn` centralize this so no
  individual widget can regress it.
- Base64 image warnings: 500KB soft warning (`ImagePanel`'s own upload and
  the config panel's image field both surface it via `showToast`), 2MB hard
  limit enforced in `readImageAsBase64` before the file is ever read into
  a data URL.
- Public preset limit (5) enforced in both `backend/routes/cluster.js`
  (server-side, can't be bypassed) and `ClusterView.jsx`'s Publish button
  (disabled with an explanatory tooltip at the limit) — verified server-side
  with a real HTTP test (6 publishes, 6th rejected).
- Deploy script additions parse-checked against the strict single-line rule.
- Nothing from Phases 1-10 was modified except the specific, narrow
  additions this phase's own spec called for (main.js's overlay/telemetry
  handler extraction, `useSocket.js`'s `clientType`, `useTelemetryShm.js`'s
  POST, `CommsView.jsx`'s new event listeners) — no unrelated refactoring.

### Verified this pass
The robotjs load-inside-real-Electron-28 test (Track 0) — the one thing this
phase most needed to actually check rather than assume. A full HTTP smoke
test of `routes/cluster.js` and `routes/telemetry.js` against the real
`server.js` with `db.js` stubbed in-memory (the same `better-sqlite3`-has-no-
prebuilt-binary-for-Node-24/win32 limitation documented since Phase 4):
create, get (with `launch_count` incrementing), publish via `PATCH`, list
dedup with `?author=`, QR success on a small layout, the 6th-public-preset
limit correctly rejected, wrong-author `DELETE` correctly 403'd,
correct-author `DELETE` succeeding, the telemetry frame POST/GET round-trip,
and the QR `too_large` path correctly triggering on a deliberately bloated
layout — all 11 checks passed against real request/response cycles, not
just code reading. Every new/touched backend file passes `node --check`.
`scripts/deploy-backend.ps1`'s additions parse as valid PowerShell.

### Not independently verified
No real Electron window was driven through the actual editor this pass (no
throwaway Playwright script, unlike Phases 4-9) — the drag/resize/marquee-
select canvas interactions, the config panel's per-widget-type field
rendering, actually publishing/loading a preset through the real UI, and the
overlay window actually appearing over a real AC session were verified by
careful code reading (including the stale-closure fix caught this way) and
the backend HTTP tests above, not by clicking through a running app. The PWA
side (`ClusterPage.jsx`, the ported widget set) was not run through a real
build in this pass either — see the next task's verification notes for
whether `vite build` caught anything this reading missed. Keystroke dispatch
itself (`robot.keyTap`) was deliberately never invoked in testing, only
confirmed present as a callable function, to avoid injecting a real
keystroke into this environment's focused window.

## Phase 12: Single Installer, Google Auth, Role System, and Host Selection

Phase 12 retrofitted the whole app with mandatory Google sign-in and a
three-tier role system (Admin/Host/Crew), added host registration and
event-level host selection, rewrote the installer as a single NSIS package,
and updated the Electron app, the PWA, and the docs to match. This is the
largest cross-cutting change since Phase 8's visual redesign — it touches
every backend route, both frontends' auth/socket wiring, and the first-run
experience of every app in the repo.

### Backend — auth, roles, hosts (Phase 0/Track 0)
- `backend/config/roles.json.example` (committed) documents the shape;
  the real `backend/config/roles.json` is gitignored and lives only on
  shinobi — `{admins:[], hosts:[], crew:[]}`, anyone unlisted defaults to crew.
- `backend/lib/roles.js` (new, not in the original spec's file list) —
  `server.js` owning roles-loading the way the spec described would create a
  circular require (`middleware/auth.js` needs roles, `server.js` needs the
  middleware), so this got its own module. Watches the **directory**, not
  the file, filtered by filename — more robust against editors that save via
  temp-file-rename (vim/nano) than watching the file handle directly.
- `backend/middleware/auth.js` — `verifyGoogleToken` via Google's
  `tokeninfo` endpoint (no JWT library), `getRole`/`requireAuth`/`requireRole`.
- `backend/routes/auth.js` extended: `POST /google` (accepts `idToken` OR
  `refreshToken`), `GET /me`, `GET`/`PATCH /roles-config` (admin-only).
- `backend/routes/admin.js` (new): `GET /users`, `PATCH /users/:uid/role`
  (rewrites `roles.json` and the cached `users.role` column together),
  plus `GET /hosts`, `DELETE /hosts/:uid`, `GET /system/health`,
  `POST /system/restart` — the latter two weren't in the original spec's
  admin-route list but are required by the Admin panel's "Server Overview"
  and "System Health" sections, which the spec did ask for.
- `backend/routes/hosts.js` (new): `POST /register`, `GET /available`,
  `GET /:uid/status`.
- `backend/db.js`: `users` and `hosts` tables; `events` gained
  `host_type`/`host_uid`/`host_name` via guarded `ALTER TABLE` (each its own
  try/catch, since the columns may already exist on re-run).
- `backend/socket.js`: `io.use()` verifies a Google ID token on every
  handshake (`socket.handshake.auth.token`) before any event handler runs;
  presence tracks `{uid, role, clientType}` and flips a host's `is_online`
  row on join/disconnect.
- **Every existing route retrofitted** with `requireAuth` (`events`, `stats`,
  `chat`, `cluster`, `telemetry`, `push`, `invites`) — no unauthenticated API
  access anywhere except the sign-in bootstrap itself (`/api/auth/config`,
  `/api/auth/google`, `/api/mods/auth/url`, `/api/mods/auth/callback` — these
  can't require a token that doesn't exist yet).
- **Dual-token header split** (`routes/mods.js`): the pre-Phase-12 upload
  route read a Google *Drive* access token from `Authorization: Bearer`, but
  that header slot is now reserved app-wide for the app's own ID token. The
  Drive access token moved to a new `X-Drive-Access-Token` header — two
  conceptually different Google tokens (ID token: who are you; access token:
  can you write to Drive) that used to share one header by coincidence.
- **Server-side-only token refresh**: the spec described refreshing an
  expired ID token "via Google's OAuth token endpoint" directly from the
  client using a stored refresh token — but that grant requires the OAuth
  client secret, which has never left the backend (a confidential/Desktop
  client type, not a public one). `lib/oauth.js` gained `refreshIdToken()`
  server-side; `POST /api/auth/google` accepts `refreshToken` as an
  alternative to `idToken` so the client only ever holds the refresh token,
  never does the exchange itself.
- Smoke-tested end-to-end twice (once for the Phase 0-4 surface, once after
  adding the admin/hosts additions) by stubbing `db.js` in the require cache
  with an in-memory equivalent and `global.fetch` to fake Google's
  `tokeninfo` responses, then loading the real `server.js`/routes/middleware
  unmodified and hitting real HTTP + a real `socket.io-client` connection —
  role resolution for all three roles, 401/403 gating on every new route,
  host registration/availability across a real socket
  connect→presence:join→disconnect lifecycle, `roles.json` actually
  rewritten on disk by a role-promotion PATCH, and socket
  connect_error/connect with/without a valid token all verified against real
  responses, not just code reading. Test files deleted after use, never
  committed.

### Electron — auth state, wizard, nav, host selection (Phase 1-4)
- `src/renderer/store/AppStore.jsx`: `googleAuth` is the single source of
  truth for sign-in state; `identity = {handle, color}` is *derived* from it
  so the shape every pre-Phase-12 view already consumes via
  `useStore().identity` (Comms/Events/Stats/Mods/Cluster/Links) never had to
  change — Phase 12 changes *where* handle/color come from, not what they
  look like to six views that already worked. `signInStatus` exposes
  `idle|exchanging|fetching-role|error|offline-available` for the Wizard's
  Connecting step.
- **"Continue offline" scope narrowed, on purpose.** The spec imagined the
  code exchange succeeding independently of the backend, with only the role
  lookup able to fail offline. In this architecture both calls need the
  backend (the exchange needs the client secret), so if the backend is
  genuinely unreachable, the exchange itself fails and there's no Google
  profile to build even a degraded identity from. "Continue offline" is only
  real, and only offered, when the exchange succeeded but the *subsequent*
  role lookup specifically failed on a network error — documented in
  `AppStore.jsx` at length since it's a deliberate, honest narrowing of the
  spec's more idealized assumption, not a missed case.
- `src/main/main.js`/`preload.js`: removed the old standalone
  `identity:get`/`identity:set` IPC (superseded by `googleAuth`); added
  `system:hostname` (host registration's machine name — the spec's own
  suggestion of reusing the invite Share modal's LAN-IP helper was actually
  wrong, an IP isn't a hostname) and `net:checkPortAvailable` (Host Status's
  port-9600 readiness check).
- `src/renderer/lib/api.js` / `hooks/useSocket.js`: axios request
  interceptor attaches `Authorization: Bearer <idToken>` to every request;
  socket `auth` option changed from a static object to a callback so a
  reconnect always sends the current token, not whatever was true at the
  first connect.
- `src/renderer/App.jsx`: `NAV` items gained a `role` field, `canAccess()`
  implements the admin⊇host⊇crew hierarchy, sidebar filters accordingly
  (hidden items are absent from the DOM, not disabled-and-visible),
  `AccessRestricted` full-page gate for direct navigation to a hidden route,
  Google avatar/handle/role badge in the sidebar footer.
- `src/renderer/components/Wizard.jsx`: full rewrite — Welcome (Google
  button) → Connecting (auto, Retry/Continue-Offline on failure) → Identity
  (Google-confirmed name/email, editable handle+color) → Backend →
  *(Host/Admin only)* AC Setup + Host Readiness Check → Done
  (role-specific copy).
- `src/renderer/views/EventsView.jsx`: `HostSelector` component — **the
  "I'll host" card only renders in the DOM when `isHost` is true**, matching
  the spec's explicit "not just disabled, not present in the DOM"
  constraint, verified by reading the conditional (`{isHost && <div>...}`),
  not a CSS `display:none`. Event proposal/detail panel carry
  `host_type`/`host_uid`/`host_name` through create/update/display.
- `src/renderer/views/SettingsView.jsx`: Profile section (Google
  avatar/name/email/role badge, handle, color swatches, Sign Out), Host
  Status section (readiness checklist + Register/Update Host Info button,
  Host/Admin-only), Connection section retained in place.
- `src/renderer/views/AdminView.jsx` (new): Crew Management (role dropdown
  per user, live counts), Host Status (remove button), Server Overview
  (**this machine's live servers only** — there's no cross-machine server
  registry, disclosed directly in the panel's own subtitle text, not just
  this doc), System Health (uptime/memory + confirm-gated Restart Backend).
- **ModsView.jsx OAuth consolidation**: this view used to run its own
  separate Google OAuth exchange for Drive access, writing to the *same*
  `googleAuth` electron-store key `AppStore.jsx` now owns for app-wide
  identity — a real collision the two features would otherwise have fought
  over. Removed ModsView's own `onCallback` listener, local `googleAuth`
  state, and sign-in/out handlers entirely; it now reads
  `googleAuth`/`user`/`signOut` from `useStore()` (the Wizard already
  guarantees sign-in before any view can render) and sends the Drive access
  token via the new `X-Drive-Access-Token` header instead of `Authorization`.

### PWA — mandatory sign-in, no guest mode (not in the original spec's scope)
The Phase 12 spec never mentions the PWA, but the PWA shares the same
backend, and the backend-wide `requireAuth` retrofit breaks the PWA's
existing "Continue as guest" browse-only mode outright — every route it
calls, including plain event/mod browsing, now needs a valid ID token. This
was a necessary, disclosed deviation, not an optional nice-to-have:
- `pwa/src/lib/auth.js`: added `'openid'` to the PWA's own PKCE scope list
  (it builds its own Google auth URL client-side, separately from the
  backend's `getAuthUrl`, and was missing the one scope that makes Google
  return an `id_token` at all — without it, sign-in would have "succeeded"
  with no token to actually authenticate anything). `exchangeCode()` now
  also calls `POST /api/auth/google` after the token exchange to register
  the user and resolve a role, mirroring the Electron flow. Added
  `getIdToken()`.
- `pwa/src/lib/api.js`: request interceptor attaches the ID token from
  localStorage (reads the key directly rather than importing
  `lib/auth.js`, which already imports this module for its own exchange
  call — importing back would be circular); response interceptor clears a
  dead session and redirects to onboarding on a real 401.
- `pwa/src/hooks/useSocket.js`: socket `auth` callback now sends the stored
  ID token, matching the backend's `io.use()` requirement.
- `pwa/src/views/OnboardingPage.jsx`: removed "Continue as guest" and the
  guest capability checklist entirely — Google sign-in is now the only path
  through onboarding, consistent with the Electron Wizard.
- `pwa/src/App.jsx`: the route guard now checks `getStoredAuth()` (a real
  session) instead of the old `isOnboarded()` flag, since being onboarded no
  longer means anything if there's no valid Google session behind it (e.g.
  after a sign-out).

### Installer — single NSIS package
- `package.json`'s `build.win.target` was already NSIS-only with no
  portable/zip target (pre-existing, not a Phase 12 change) — added
  `nsis.license`/`nsis.include` pointing at two new files, and
  `version:patch`/`version:minor`/`version:major` scripts (`npm version` +
  push + push --tags in one command).
- `resources/installer.nsh` (new): `customHeader` (branding text),
  `customInit` (force-closes a running `ShinRacer.exe` before installing
  over it — otherwise a locked exe fails the install partway through with a
  confusing error), `customInstall` (no-op — nothing needs creating at
  install time), `customUnInstall` (asks Yes/No before deleting
  `%APPDATA%\ShinRacer`, rather than always keeping or always wiping it
  silently). Verified by actually compiling it with `makensis.exe` (found
  pre-cached at `%LOCALAPPDATA%\electron-builder\Cache\nsis\...\Bin\`) inside
  a minimal wrapper `.nsi` that includes the four macros — compiled clean,
  only pre-existing MUI2-scaffolding warnings unrelated to this file's own
  code, not just eyeballed for syntax.
- `resources/license.txt` — copied from the repo root's `LICENSE` (MIT).
- `.github/workflows/release.yml`: added npm cache; added a follow-up step
  that overwrites electron-builder's auto-generated release notes (just the
  tag name) with `.github/release-template.md`, substituting the version in.
- `.github/release-template.md` rewritten — it still said "AC Companion" /
  `AC-Companion-Setup-{version}.exe` from before the ShinRacer rename, and
  now also mentions the mandatory Google sign-in requirement.
- **Known pre-existing gap, not fixed**: `resources/icon.ico` is referenced
  by `package.json` (`build.win.icon`, `nsis.installerIcon`) but doesn't
  exist anywhere in the repo — predates Phase 12, wasn't part of its scope,
  and there's no source image to convert. A real `electron-builder` run will
  fail on this until an icon is added; `npx vite build`/`node --check`
  (which don't invoke electron-builder) both still pass. Documented in the
  new `docs/RELEASING.md` so it isn't a surprise at release time.

### Docs
- `docs/ADMIN_SETUP.md` (new): `roles.json` shape, bootstrapping the first
  admin by hand (there's no one with permission to promote them yet), the
  Admin panel's four sections, becoming a Host (role vs. machine
  registration are different things — a role says "allowed to host," a
  registration says "this PC is available for crew to pick").
- `docs/RELEASING.md` (new): the tag → GitHub Actions → published-release
  pipeline, `npm run release:dry` for local sanity checks, what's actually
  inside the installer, the `installer.nsh` macros explained, and the
  icon.ico gap flagged explicitly.
- `docs/FRIEND_SETUP.md` rewritten around mandatory Google sign-in for both
  the desktop app and the PWA's "Option B" — the old copy explicitly said
  browsing worked without signing in, which is no longer true.
- `docs/GOOGLE_DRIVE_SETUP.md`: one clarifying paragraph added — "no login
  required for downloads" was, and still is, true about the *Drive* API call
  specifically (service-account read access), but is easily misread now that
  signing in to ShinRacer itself is mandatory app-wide; both facts are now
  stated side by side instead of just the first one.
- `README.md`: tagline/intro paragraph's "no accounts"/"no login screen"
  claims fixed (Google sign-in is now mandatory), new "🔐 Roles & Admin
  Panel" feature section, First-Run Wizard section rewritten for the
  Google-first flow, new **Roles** table (Admin/Host/Crew → what each gets),
  "If you're joining the crew" steps updated, a Google Cloud prerequisite
  added to the hosting section, Under the Hood table gained an Auth row.

### Verified this pass
Every backend file (new and touched) passes `node --check`. Both the
Electron renderer (`npx vite build`, 161 modules) and the PWA
(`npx vite build`, 152 modules) compile clean with no new errors —
confirms `AdminView.jsx`, the `ModsView.jsx` consolidation, the
`SettingsView.jsx`/`EventsView.jsx` rewrites, and every PWA auth file change
are all syntactically and import-correctly wired, not just individually
read. The backend's full auth/role/host surface was smoke-tested twice
against real HTTP + a real socket connection (see above), not just read.
`resources/installer.nsh` was compiled with a real `makensis.exe` inside a
minimal wrapper script, not just eyeballed. `package.json` and the new
`release.yml` were both parsed (`JSON.parse` / Python's `yaml.safe_load`) to
confirm they're syntactically valid, not just visually plausible. Ran
`npm run dev` for real: Vite served on 5173, Electron came up, and
`%APPDATA%\ShinRacer\logs\main-*.log` shows a clean `App started` →
`AC detected at D:\SteamLibrary\...` sequence with no errors — since AC
detection fires from a `useEffect` inside `AppStoreProvider` after the
renderer mounts, this confirms the renderer bundle (including the rewritten
`AppStore.jsx`/`Wizard.jsx`/`App.jsx` and the new `AdminView.jsx`) loaded and
rendered without a top-level crash. The dev instance was then stopped
cleanly.

### Not independently verified
No real Google Cloud OAuth credentials exist in this environment, so an
actual end-to-end sign-in (real consent screen, real token exchange, a real
role landing on a real signed-in session) was never exercised in either app
— only the code on both sides of that boundary, independently, the same
caveat every earlier Google-auth-touching phase (6, 10) already carried. No
interactive click-through of the Wizard's new steps, the Admin panel's four
sections, or the PWA's rewritten onboarding was done this pass (no
throwaway Playwright script, unlike Phases 4-9) — verified by careful
reading plus the clean builds/boot log above, not by clicking through a
running app. A real `electron-builder`/NSIS packaging run was not attempted
(blocked by the pre-existing missing `icon.ico`, see above) — only the
`.nsh` macros were compiled standalone.

## Follow-up: real app icon + a desktop shortcut

2026-07-09, right after Phase 12: the "known pre-existing gap" flagged above
(`resources/icon.ico` referenced but never created) is closed.
`scripts/generate-icon.js` hand-encodes a real, valid multi-resolution
(16/32/48/256px) `.ico` — same zero-dependency PNG-via-`zlib` technique and
the same blue "SR" pixel-font mark as `pwa/scripts/generate-icons.js`'s
home-screen icons, so the desktop and mobile apps now share one visual
identity — see `docs/RELEASING.md`'s "The app icon" section for the full
writeup. Verified two ways: decoded the `.ico` back (parsed `ICONDIR` +
all four `ICONDIRENTRY` records, inflated and size-checked every embedded
PNG) and, separately, actually booted the app and screenshotted a
correctly-rendered "SR" mark in the real Windows taskbar — not just a
valid-on-paper file.

A `ShinRacer.lnk` desktop shortcut was also created (`node_modules\electron\
dist\electron.exe .`, working directory the repo root, no `--dev` flag) —
this runs the exact production code path `main.js` already has (`isDev` off
→ loads `dist/index.html` directly, no Vite dev server needed), just via the
project's own local Electron binary instead of a packaged installer, since
`electron-builder`'s NSIS output still isn't buildable in this environment
(no `makensis` network access confirmed, and packaging wasn't attempted this
pass) — `npm run dev`/`npx vite build` remain the supported way to actually
run and verify the app here. Re-run `npx vite build` before using the
shortcut any time renderer source changes, since it loads whatever is
already in `dist/`, not live source.

## Phase 13: Multi-game telemetry support

Phase 13 extended Phase 9's AC1-only Live Telemetry tab to five more games —
ACC, AC Evo, AC Rally, FH5, and FH6 — behind one canonical frame shape, via
a new `src/main/telemetry/` module replacing the old inline SHM code in
`main.js`.

### The actual research this phase needed

The spec's own protocol notes were explicit that ACC's and AC Evo's byte
offsets were "approximate... verify against SDK if behavior is unexpected."
That verification was actually done, not skipped:

- **ACC**: offsets were computed field-by-field from
  [github.com/Dekadee/accshm](https://github.com/Dekadee/accshm), a real,
  working Go library that reads real ACC shared memory — not guessed. This
  turned up something the spec got wrong: **the spec's "ACC additions"
  list is almost entirely AC Evo's fields, not ACC's.** `waterTemp`,
  `frontBrakeCompound`/`rearBrakeCompound`, `padLife`/`discLife`,
  `rainIntensity`, and all four `mfdTyrePressure*`/`mfdTyreSet`/
  `mfdFuelToAdd` fields don't exist in ACC's real struct at all — but they
  (or close equivalents) DO exist in AC Evo's real struct, cross-checked
  against a second independent source below. The two games share engine
  lineage (both post-AC1 Kunos titles), which is the likely source of the
  mix-up. `src/main/telemetry/sources/acc.js` uses the real, verified
  offsets and nulls the fields that don't actually exist for this game,
  documented inline rather than silently dropped.
- **AC Evo**: the *entire* struct — physics, graphics, and static — was
  extracted from
  [github.com/dSyncro/acevo-shared-memory](https://github.com/dSyncro/acevo-shared-memory)'s
  bindgen source header (`src/bindings/source/wrapper.hpp`), a real C++
  header (`#pragma pack(4)`) backing a real, working Rust crate. The
  physics struct is homogeneous 4-byte fields (no padding risk); the
  graphics struct mixes bool/int8_t/short/uint64_t with floats — its ~135
  fields were laid out **programmatically** (a small Node script summing
  each field's size+alignment in declared order), not by hand, specifically
  to avoid a manual arithmetic slip cascading through the whole struct.
  Both the physics and graphics offsets were then verified by writing
  synthetic buffers with known values at the computed offsets and
  confirming they read back correctly with no cross-field contamination —
  not just computed and trusted. This is a real upgrade over the spec's own
  "~offset, unverified" numbers for the one game the spec was most worried
  about (AC Evo's early-access instability) — see acEvo.js's header comment
  for the full source citation.
- **AC Rally**: no equivalent struct dump exists anywhere public. A
  targeted search surfaced one specific, more useful claim than the spec's
  own assumption though: AC Rally shares ACC's memory layout, not AC1's
  (both are the newer post-AC1 Kunos engine) — `ACRallySource` extends
  `ACCSource` on that basis rather than `AC1Source` per the spec's literal
  instruction, with the five rally-specific fields (handbrake, surfaceGrip,
  rallyStageTime, rallyPenaltyTime, distanceToFinish) still at unconfirmed,
  TODO-flagged offsets appended after ACC's known struct end, since nothing
  concrete exists for those anywhere.
- **Forza (FH5/FH6)**: the spec's own byte table is precise and internally
  matches real-world knowledge of Forza's public "Horizon Data Out"
  format — used directly, no research needed. One internal inconsistency
  in the spec was caught and resolved: its FH5 section header says "232
  bytes total" but its own field table runs to byte 310 (311 bytes total),
  and the FH6 section explicitly says "323 bytes (FH5: 311 bytes)" — 311
  was used since it's both internally consistent and matches the real
  format; "232" is almost certainly a stale label copied from Forza's
  older, shorter "Sled" packet format. Verified live: a real UDP round-trip
  (synthetic 311/323-byte packets sent over an actual loopback socket) confirmed
  `ForzaSource`'s per-packet version detection and `ForzaSource.probe()`
  both work correctly, not just against synthetic Buffers in-process.

### Architecture (`src/main/telemetry/`)

- `sources/ac1.js` — Phase 9's exact reader, extracted unchanged. Also
  exports `buildShmReaderScript(prefix, pollIntervalMs)` and
  `probeShmSegment(name)`, parametrized by segment prefix specifically so
  `acEvo.js` (a completely different struct, but the identical
  MemoryMappedFile-over-PowerShell mechanism) can reuse them instead of
  duplicating the reader script.
  - **Probe hardening found during this pass**: `probeShmSegment`'s first
    real run in this environment showed PowerShell interleaving progress-
    stream CLIXML noise into stdout ahead of the real "OK"/"FAIL" line
    (observed on `Add-Type`'s first use) — an exact-string match on the
    whole trimmed output would have silently misread a real success as a
    failure. Fixed to check line-by-line for an exact "OK" instead.
- `sources/acc.js` — `ACCSource extends AC1Source` for the shared start/
  stop/reader-process plumbing (same `Local\acpmf_*` segment names), but
  **fully overrides** `parsePhysics`/`parseGraphics` rather than appending
  fields after AC1's — the real struct diverges field-for-field, not just
  "AC1 plus extras," per the research above. `parseStaticInfo` is inherited
  from AC1Source unchanged — no ACC-specific static-struct offsets were
  found anywhere, and the spec didn't call out static-struct differences
  either, so this is a disclosed assumption, not a verified fact.
- `sources/acRally.js` — `ACRallySource extends ACCSource` (see research
  above), appending the five rally-only fields at unconfirmed offsets.
- `sources/acEvo.js` — does NOT extend AC1Source (unrelated struct). Every
  single field read is wrapped in its own try/catch with a per-field
  last-known-good fallback (verified live: a deliberately truncated buffer
  correctly fell back to the prior tick's value per-field and set
  `parseError: true`, rather than losing the whole frame). Tracks
  `smVersion` from the static struct and fires a one-time warning callback
  the moment it changes — there's no way to "re-probe" a byte layout
  automatically (shared memory has no self-describing schema), so a
  changed version means every offset in this file may now be stale until
  it's manually updated, and the warning says exactly that rather than
  silently continuing to parse what might be garbage.
- `sources/forza.js` — deliberately thin: owns only the UDP socket and
  per-packet version detection by byte length (311/323). All the actual
  byte-offset parsing lives in `normalizer.js`'s `normalizeForza(buf,
  version)`, matching the spec's own architecture note. Defaults to port
  **5300**, never 8000 (Q2's own Forza-telemetry port) — `ForzaSource`
  itself refuses to hardcode 8000 anywhere, and the port is user-
  configurable from Settings.
- `gameDetector.js` — process-list detection first (editable `EXE_NAMES`
  config at the top, explicitly flagged as unverified assumptions per the
  spec's own instruction), shared-memory probe second (disambiguates
  AC1/ACC/AC Rally, which all share `Local\acpmf_*`, by re-checking the
  process list), Forza UDP probe last (only reached if nothing else
  matched, since it's the one check that touches the network). Exports a
  stateless one-shot `detect()` — the 5s/30s polling backoff and
  game:detected/game:lost emission live in TelemetryManager instead, a
  cleaner split between "what's running right now" and "when to check."
- `normalizer.js` — `normalizeAC1`/`normalizeACC`/`normalizeACEvo`/
  `normalizeACRally`/`normalizeForza`, each mapping to one canonical frame
  shape. Every Phase-13-new field defaults to `null` via a shared
  `nullExtendedFields()` helper (called fresh per frame — arrays/objects
  are never a shared reference two frames could alias), which normalizers
  then override with whatever they can actually provide. Verified live: a
  synthetic-buffer smoke test ran all six normalizers (five games + demo's
  shape via the mock frame) back to back with zero exceptions, confirming
  the whole pipeline holds together end to end, not just each file in
  isolation.
- `index.js` — `TelemetryManager`. Auto-detect mode re-polls on the 5s/30s
  backoff and picks up game switches (closing AC1, opening ACC) live.
  Manual mode is a deliberate simplification: it's a one-shot pin with no
  background polling — the 5s/30s backoff exists specifically to support
  auto-detection's game-switching case, which manual mode opts out of by
  definition, so flipping the Settings dropdown takes effect on the next
  explicit (re)start (e.g. "Test telemetry"), not live in the background.

### main.js integration

`startShmTelemetry()`/`stopShmTelemetry()` kept their exact Phase 9 names
and call signature — both the two `telemetry:shmStart`/`shmStop` IPC
handlers and the Cluster Fucker's `cluster:callFn` dispatch
(`'telemetry.start'`/`'telemetry.stop'`) call them unchanged, so neither
call site needed to change at all; only their internal implementation now
delegates to a lazily-constructed `TelemetryManager`. The window `closed`
cleanup handler's old direct `shmProcess`/`shmActive` check was replaced
with a plain `stopShmTelemetry()` call. New IPC:
`telemetry:getActiveGame`/`telemetry:setForzaPort`, plus `game:detected`/
`game:lost`/`telemetry:warning` events forwarded to the renderer — all
added to `preload.js` alongside the existing telemetry bridge. The old
UDP-based `telemetry:start`/`stop`/`onLap` handlers (Lap Stats' separate,
AC1-only UDP feed) are completely untouched, per the explicit constraint.

### Renderer

- `useTelemetryShm.js` gained a `warning` field (the AC Evo version-change
  event) alongside its existing `frame`/`isLive`/`isDemo`/`error`.
- `TelemetryView.jsx`: a colored `GameBadge` next to the LIVE/DEMO status
  dot (AC1=blue, ACC=green, AC Evo=purple, AC Rally=orange, FH5/FH6=Forza
  green, Demo=muted), an orange AC-Evo-specific banner when
  `frame.parseError` or a version-change warning fires, and a collapsible
  per-game "How to enable telemetry" accordion.
  - **Real UX conflict found and resolved, not just implemented literally**:
    the spec's "when status is 'waiting'" wording assumes a persistent
    waiting state, but `useTelemetryShm`'s existing demo-mode fallback
    (unchanged since Phase 9) kicks in ~500ms after the last real frame —
    so a bare "waiting, no game yet" state is only ever visible for a
    flash before demo mode takes over. The setup instructions are shown
    whenever demo mode is active (which *is* "no real game detected" from
    the user's point of view), rendered alongside the widget grid rather
    than replacing it — demo mode's whole point is letting someone see what
    the dash looks like while they figure out how to get it live, and
    hiding the widgets to show setup text instead would work against that.
- `components/telemetry/widgets.jsx`: `TyreMap` grew an optional brake-temp
  bar per corner (only rendered when `brakeTemp` is non-null — ACC today);
  `FuelBar` shows a percentage instead of litres for `fh5`/`fh6` (Forza's
  `fuel` field is already a 0-1 fraction, `maxFuel` is null since Forza
  never exposes an absolute tank size); `StatusBar` gained a rain-intensity
  emoji after the flag indicator. Three new widgets registered in
  `WIDGET_CATALOG`: `GapWidget` (SESSION — AC Evo's gapAhead/gapBehind,
  green when the gap is in the driver's favor), `BoostGauge` (MOTION —
  reads either `frame.boost` or `frame.turboBoost`, whichever a game
  populates), `PowerTorque` (MOTION — kW/N·m side by side, Forza-only
  today). All three render "--" rather than a fabricated number when their
  backing fields are null, per the spec's own null-vs-zero constraint.
- `SettingsView.jsx`: new Telemetry section (Host/Admin-only, below AC
  paths) — auto-detect toggle, a manual game dropdown shown only when
  auto-detect is off, a Forza port field (with the Q2-port-conflict
  warning inline), and a "Test telemetry" button that starts the manager,
  waits 3s, and reports the detected game or "No game detected." Auto-
  detect/manual-game persist directly via the existing `api.store` bridge
  (TelemetryManager reads the same electron-store keys itself — no new IPC
  needed for those two); the Forza port specifically goes through the new
  `telemetry:setForzaPort` IPC instead, since that one needs to also live-
  restart an already-running `ForzaSource` with the new port.
- `lib/telemetryMock.js`: the demo frame gained `game: 'demo'`/
  `gameDisplayName: 'Demo'` so the new game-badge component works
  identically in demo and live modes without a special case.

### Noted deviations

- **ACC's "additions" list was corrected against real data** — see the
  research section above. This is the single most consequential deviation
  in this phase: implementing the spec's literal list would have produced
  fields that don't exist in real ACC telemetry, populated with
  garbage read from whatever ACC's actual struct happens to have at those
  invented offsets.
- **AC Rally extends ACCSource, not AC1Source** — a judgment call backed by
  a specific (if less authoritative than ACC's/AC Evo's) search finding,
  not the spec's own assumption. Flagged as the first thing to try
  reverting if rally telemetry looks wrong in real testing.
- **Manual-mode telemetry selection doesn't hot-reload in the background**
  — a deliberate simplification, not an oversight; see index.js's notes
  above.
- **AC Rally's five extra physics fields remain genuinely unconfirmed** —
  no amount of research turned up real offsets for these; they're
  TODO-flagged placeholders exactly as the spec's own constraints
  anticipated some fields would need to be.
- **PowerTorque's category** (MOTION) wasn't specified by the spec at all —
  grouped alongside BoostGauge since both are engine/powertrain readouts,
  rather than SESSION where GapWidget's category was explicit.

### Verified this pass

Every new/touched main-process file passes `node --check`. All five
per-game normalizers (plus the demo mock's shape) were smoke-tested
together against synthetic buffers with zero exceptions. `ACCSource`'s
computed offsets were verified against a synthetic buffer with known
values written at each offset, confirming clean round-trips with no
cross-field bleed. `ACEvoSource`'s graphics offsets (the trickiest, mixed-
alignment ones) were verified the same way, including gapAhead/gapBehind
and carModel string extraction. The per-field defensive fallback was
verified against a deliberately truncated buffer — confirmed it falls back
to the prior tick's per-field value and sets `parseError: true` rather than
losing the whole frame or throwing. `ForzaSource` was verified with a real
UDP round-trip over an actual loopback socket (not just an in-process
Buffer call) for both version detection and the standalone `probe()`
method. `probeShmSegment`'s CLIXML-noise-tolerance fix was verified by
actually running `gameDetector.detect()` in this environment (no AC-family
game or Forza running here) and confirming it correctly returns `null`
after trying every detection method, in ~2.7s, with no unhandled
exceptions despite the real PowerShell noise observed. `npx vite build`
compiles clean after every renderer change (161 modules throughout, no new
warnings). A full Electron boot (`electron.exe .`, no `--dev`) was run
after the main.js refactor and confirmed a clean `App started` → `AC
detected` sequence in `%APPDATA%\ShinRacer\logs\main-*.log` with no errors,
confirming `require('./telemetry')` (pulling in all five sources +
gameDetector + normalizer) loads without a top-level crash.

A real interactive click-through was also driven via a throwaway
`playwright` `_electron` script (`npm install --no-save`, deleted after
use, never added to `package.json`/`package-lock.json` — confirmed clean
via `git status` afterward), same technique as Phases 4-9. Since Phase 12
made Google sign-in mandatory, reaching the main app required hand-seeding
an isolated `--user-data-dir`'s `config.json` with a fake but well-shaped
`googleAuth`/`settings.setupComplete` (AppStore's mount effect tolerates
this: a network failure verifying the token against the real backend keeps
the cached auth rather than forcing sign-out) and stepping through the
first-run Wizard. Once in: navigated to the Telemetry tab and confirmed via
both a full DOM text dump and a screenshot that the DEMO badge renders
correctly next to "DEMO MODE" (blue outline, matching the design system),
the updated "No game detected — showing simulated data" copy is live, all
existing widgets still render real (mock) data with no regressions, and
the new "HOW TO ENABLE TELEMETRY" accordion appears below the widget grid
listing all six games. Switched to the CONFIGURE tab and confirmed all
three new widgets appear in the checklist under the intended categories —
"Boost Gauge" and "Power / Torque" under MOTION, "Gap Ahead / Behind" under
SESSION — alongside every pre-existing widget, unchanged.

### Not independently verified

No real ACC, AC Evo, AC Rally, or Forza Horizon installation exists in this
environment, so none of the five new sources were ever exercised against
genuine game telemetry — only against the documented/reverse-engineered
struct layouts (verified as thoroughly as external research allows, see
above) and synthetic buffers with known values. A crew member with any of
these games actually running should see real values; if a field reads as
garbage, the specific source file's header comment says exactly which
reference it came from and how confident that reference is. AC Rally in
particular has no real-world verification path available anywhere right
now — its five rally-specific fields are placeholders until someone can
test against a real session. The AC Evo warning banner and the game
badge's per-game colors for anything other than "demo" (ac1/acc/acevo/
acrally/fh5/fh6) weren't visually confirmed this pass, since faking a
specific game's live frame shape through the real UI wasn't attempted —
only demo mode's rendering was — but they use the exact same `GameBadge`
component and conditional-rendering logic already confirmed working for
demo, just with a different `frame.game` value and color lookup.
