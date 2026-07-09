# AC Server Manager — ShinTech Edition

Windows desktop companion app for Assetto Corsa — build, deploy, and run
dedicated servers; edit CSP AI Traffic + sol WeatherFX configs; and coordinate
race nights with friends via a shared Events calendar, WebRTC voice + text
Comms hub, and live Lap Stats.

Built with Electron + React + Vite, backed by a small Node/Express service for
the multiplayer features. No Python dependency required.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org
- **Assetto Corsa** installed via Steam
- `acServer.exe` present at `…\assettocorsa\server\acServer.exe`
  (ships with AC; or grab it from the AC dedicated server package on Steam Tools)
- *(Optional, for Events/Comms/Stats)* a backend host reachable by everyone
  who'll use those features — see [Backend](#backend-events--comms--stats)
  below. A Raspberry Pi or any always-on machine on your LAN/Tailscale works.

---

## Dev setup

```powershell
# Clone / copy project folder to your machine, then:
cd ac-server-manager
npm install
npm run dev
```

This starts Vite (renderer, port 5173) and Electron simultaneously.
On first launch you'll get a short setup wizard — it auto-detects your AC
install from default Steam paths, asks for a handle/color, and (optionally)
a backend URL. You can skip anything and fill it in later from Settings.

---

## Build `.exe`

```powershell
npm run build
```

Output: `dist-electron/AC Server Manager Setup.exe`
Installer is NSIS, one-click, installs to `Program Files\AC Server Manager`.
Requests admin elevation (needed to write AC server cfg files and spawn processes).

---

## Backend (Events / Comms / Stats)

Live Servers, Build, Garage, Traffic Manager, and Settings all work fully
offline. Events, Comms, and Stats are shared features — everyone in your
group points their app at the same backend, which relays events, chat,
WebRTC signaling, and lap telemetry between clients.

```powershell
cd backend
npm install
node server.js
```

Runs on port 3000 by default (`PORT` env var to override), stores data in a
local SQLite file, and serves uploaded event posters as static files. Point
every client's Settings → Backend URL (or the setup wizard's Backend step)
at `http://<host>:3000`.

`scripts/deploy-backend.ps1` is a ready-to-adapt example for pushing the
backend to a remote host over `scp`/`ssh` and running it as a `systemd`
service (`backend/ac-companion.service`) — edit the host/user placeholders
at the top for your own setup.

**Note:** `better-sqlite3` compiles a native module on install. Prebuilt
binaries cover most common Node/OS combinations; if `npm install` fails
building it, you'll need a C++ toolchain (on Windows: Visual Studio Build
Tools with the "Desktop development with C++" workload).

---

## Project structure

```
ac-server-manager/
├── src/
│   ├── main/
│   │   ├── main.js              ← Electron main process (IPC, server/telemetry/protocol handling)
│   │   └── preload.js           ← Secure IPC bridge (contextBridge)
│   └── renderer/
│       ├── App.jsx              ← Root shell + nav + first-run gate
│       ├── main.jsx             ← React entry
│       ├── index.html
│       ├── components/
│       │   ├── primitives.jsx   ← Design tokens + shared components
│       │   ├── Wizard.jsx       ← First-run setup wizard
│       │   └── ErrorBoundary.jsx
│       ├── store/
│       │   └── AppStore.jsx     ← React context + electron-store persistence
│       ├── hooks/
│       │   ├── useSocket.js     ← Shared Socket.io connection
│       │   ├── useWebRTC.js     ← Voice chat mesh
│       │   └── useTelemetry.js  ← UDP lap data
│       ├── lib/
│       │   ├── api.js           ← Backend REST client
│       │   ├── iniUtils.js      ← INI/JSON generators + parser for AC + traffic configs
│       │   └── format.js        ← Lap time formatting
│       └── views/
│           ├── DeployView.jsx   ← Live servers, pit boards, log streaming, invite/join links
│           ├── BuildView.jsx    ← Server config wizard, entry list editor, INI preview
│           ├── GarageView.jsx   ← Saved presets
│           ├── TrafficView.jsx  ← CSP AI Traffic + sol WeatherFX editor
│           ├── EventsView.jsx   ← Shared events calendar
│           ├── CommsView.jsx    ← Voice + text chat hub
│           ├── StatsView.jsx    ← Lap times, sessions, leaderboards
│           └── SettingsView.jsx ← AC path, identity, backend URL, quick phrases
├── backend/
│   ├── server.js                ← Express + Socket.io entry
│   ├── db.js                    ← SQLite schema + query helpers
│   ├── socket.js                ← Chat relay, WebRTC signaling, presence
│   └── routes/                  ← events, stats, chat, invites REST APIs
├── resources/
│   └── icon.ico
├── scripts/
│   └── deploy-backend.ps1       ← Example remote backend deploy script
├── package.json
├── vite.config.js
└── README.md
```

---

## Features

### Live Servers
- Pit board cards showing player count, uptime, port, PID
- Real-time log streaming direct from `acServer.exe` stdout
- Stop server (SIGTERM + Windows `taskkill /F` fallback)
- Open log folder in Explorer
- **Share an invite**: generates a join code + QR code + `/connect` command for a
  running server, with a live expiry countdown and revoke
- **Join a server**: enter a friend's invite code (or scan/open the link) to see
  connection details and jump into Content Manager

### Build
- Browses your actual `content/tracks` and `content/cars` folders
- Generates `server_cfg.ini` and `entry_list.ini` — live preview in right panel
- Entry list editor: per-slot car/skin/driver/GUID, with an auto-fill button
- Sessions: Practice / Qualifying / Race with configurable lengths
- Driver aids: TC, ABS, stability, autoclutch, tyre blankets per-server
- Optional stracker plugin block
- Writes config files then spawns `acServer.exe` directly

### Garage
- Saved server presets, load to edit or launch instantly
- Persisted via `electron-store` (survives app restarts)

### Traffic Manager
Edits CSP AI traffic config + sol WeatherFX density schedule for open-world maps like Shutoko Revival Project.

**Behaviour & Spawning tab**
- Max cars, spawn/despawn distances, respawn cooldown, initial burst
- Aggression (colour-coded Polite → Dangerous), lane discipline, following gap
- Speed range, speed limit multiplier, brake distance multiplier
- Overtaking, horn, headlights toggles
- Quick-set presets: Sunday Driver / City Commuter / Midnight Runner / Tactical Chaos

**Car Roster tab**
- Per-car: model ID (dropdown from your actual cars folder), skin, weight, max-on-track
- Live spawn probability bar showing weighted breakdown
- Add / remove / disable cars freely

**Density Schedule tab**
- SVG 24h curve — drag any of the 24 hour handles to set density
- Quick-sets: Flat 50% / Rush Peaks / Night Only / Max / Clear
- Hour grid with mini progress bars, colour-coded by time type

**File Preview tab**
- Shows exact `traffic_config.ini` and `settings.json` with syntax highlighting
- Copy to clipboard
- "Save to map" writes both files to `{trackFolder}\data\traffic\`, backing up originals to `data\traffic\backup\` with timestamp
- "Load existing" reads an already-configured map's files back into the editor

### Events (requires backend)
- Month calendar, propose/accept flow — an event moves from Proposed to
  Happening once someone besides the proposer accepts
- Poster upload, required-mods list, car class/restriction, notes
- Edit, cancel, delete, and "Add to Calendar" (.ics export)
- Generate a server invite straight from a happening event's detail panel,
  when a live server matches its track

### Comms (requires backend)
- WebRTC mesh voice chat — device selectors, input level meter, per-peer
  volume, speaking indicators, push-to-talk (rebindable) or open mic
- Text chat with message history, editable quick-phrase buttons, join/leave
  system messages

### Stats (requires backend)
- Ingests AC's UDP lap telemetry directly (`[LIVE_TELEMETRY]` in `cfg.ini`)
- Personal bests, session leaderboard, per-lap S1/S2/S3 bar chart with a PB line
- CSV/JSON export, invalid-lap flagging

### Settings
- Auto-detects AC from default Steam paths, with manual path overrides
- Identity (handle + color), backend URL with a connection test, quick-phrase editor
- Main-process log folder shortcut

---

## Traffic config files explained

### `traffic_config.ini`
Read by CSP (Custom Shaders Patch). Controls:
- `[TRAFFIC]` — ACTIVE, MAX_CARS, VARIATION
- `[BEHAVIOR]` — speeds, aggression, gaps, toggles
- `[SPAWNING]` — distances, burst, cooldown
- `[SCHEDULE]` — DENSITY_HOUR_00 … DENSITY_HOUR_23 (read by sol WeatherFX)
- `[CAR_00]` … `[CAR_XX]` — spawn list with weights

### `settings.json`
Read by sol / WeatherFX. Mirrors behavior keys + densitySchedule array.

---

## Example: SRP Traffic Setup

1. Point Traffic Manager at your SRP track folder
   e.g. `…\assettocorsa\content\tracks\shuto_revival_project_beta`
2. Click **Load existing** — the app reads whatever CSP config ships with the map
3. Switch to the **Drift Night** profile (or clone and tweak)
4. Adjust car roster to whatever JDM cars you have installed
5. Set density peaks for your session time
6. Click **Save to map** — originals are backed up automatically

---

## Known limitations

- "Connect in AC" on a joined invite opens this app's own `accomp://`
  protocol handler, which confirms the link but doesn't yet hand off to
  Content Manager automatically — copy the printed `/connect` command into
  CM's console for now
- No authentication — Events/Comms/Stats are designed for a closed
  friends-only group on a shared LAN or Tailscale network, not the open internet

---

*ShinTech Electronics · AC Server Manager*
