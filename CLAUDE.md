# AC Companion App — Claude Code Project Brief

> App display name: ShinRacer (repo remains AC1Companion)

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
