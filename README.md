# AC Server Manager — ShinTech Edition

Windows desktop app for building, deploying, and maintaining custom Assetto Corsa servers — including a full CSP AI Traffic + sol WeatherFX config editor.

Built with Electron + React + Vite. No Python dependency required.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org  
- **Assetto Corsa** installed via Steam  
- `acServer.exe` present at `…\assettocorsa\server\acServer.exe`  
  (ship with AC; or grab from the AC dedicated server package on Steam Tools)

---

## Dev setup

```powershell
# Clone / copy project folder to your machine, then:
cd ac-server-manager
npm install
npm run dev
```

This starts Vite (renderer, port 5173) and Electron simultaneously.  
The app auto-detects your AC install from default Steam paths on first launch.

---

## Build `.exe`

```powershell
npm run build
```

Output: `dist-electron/AC Server Manager Setup.exe`  
Installer is NSIS, one-click, installs to `Program Files\AC Server Manager`.  
Requests admin elevation (needed to write AC server cfg files and spawn processes).

---

## Project structure

```
ac-server-manager/
├── src/
│   ├── main/
│   │   ├── main.js          ← Electron main process
│   │   └── preload.js       ← Secure IPC bridge (contextBridge)
│   └── renderer/
│       ├── App.jsx           ← Root shell + nav
│       ├── main.jsx          ← React entry
│       ├── index.html
│       ├── components/
│       │   └── primitives.jsx  ← Design tokens + shared components
│       ├── store/
│       │   └── AppStore.jsx    ← React context + electron-store persistence
│       ├── lib/
│       │   └── iniUtils.js     ← INI/JSON generators for AC + traffic configs
│       └── views/
│           ├── DeployView.jsx   ← Live servers / pit boards / log streaming
│           ├── BuildView.jsx    ← Server config wizard + INI preview
│           ├── GarageView.jsx   ← Saved presets
│           ├── TrafficView.jsx  ← CSP AI Traffic + sol WeatherFX editor
│           └── SettingsView.jsx ← AC path config
├── resources/
│   └── icon.ico
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

### Build
- Browses your actual `content/tracks` and `content/cars` folders
- Generates `server_cfg.ini` and `entry_list.ini` — live preview in right panel
- Sessions: Practice / Qualifying / Race with configurable lengths
- Driver aids: TC, ABS, stability, autoclutch, tyre blankets per-server
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

### Settings
- Auto-detects AC from default Steam paths
- Manual path overrides with file browser
- Default server name and admin password

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

## Notes for shinobi / SRP setup

1. Point Traffic Manager at your SRP track folder  
   e.g. `…\assettocorsa\content\tracks\shuto_revival_project_beta`
2. Click **Load existing** — the app reads whatever CSP config ships with the map
3. Switch to the **Drift Night** profile (or clone and tweak)
4. Adjust car roster to whatever JDM cars you have installed
5. Set density peaks for your session time
6. Click **Save to map** — originals are backed up automatically

---

## Known limitations

- Entry list editor (per-slot car/skin/GUID) is not yet implemented — `entry_list.ini` is auto-generated by distributing selected cars across all slots evenly
- Traffic INI parser (load-back from existing files) is stubbed — file is read but not yet parsed into profile state
- UDP plugin / CM stracker integration not yet wired

---

*ShinTech Electronics · AC Server Manager v1.0.0*
