# AC Companion App — Claude Code Project Brief

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

### Known stubs to fix as part of this work:
- `iniUtils.js` → `parseTrafficIni()` — parse existing traffic_config.ini back into profile state (so "Load existing" actually populates the editor)
- `BuildView.jsx` → Entry list editor — per-slot car/skin/GUID assignment tab (currently auto-generated evenly)

### New views to build:
- `src/renderer/views/EventsView.jsx` — calendar + propose/accept flow
- `src/renderer/views/CommsView.jsx` — voice + text chat hub
- `src/renderer/views/StatsView.jsx` — lap times + session stats

### New backend to build:
- `backend/server.js` — Express + Socket.io entry point
- `backend/db.js` — SQLite schema + queries (events, messages, laps, users)
- `backend/routes/events.js` — GET/POST/PATCH events, poster upload
- `backend/routes/stats.js` — POST lap, GET laps by user/track/session
- `backend/routes/chat.js` — message history REST endpoint
- `backend/socket.js` — Socket.io handlers (chat relay, WebRTC signaling, user presence)

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
