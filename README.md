```
╔══════════════════════════════════════════════╗
║   ShinRacer  ·  ShinTech Electronics         ║
║   Race. Drift. Coordinate.                   ║
╚══════════════════════════════════════════════╝
```

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Electron](https://img.shields.io/badge/electron-28-47848F) ![Node](https://img.shields.io/badge/node-24-green) ![License](https://img.shields.io/badge/license-MIT-yellow) ![Status](https://img.shields.io/badge/status-active-brightgreen) ![Built with Claude](https://img.shields.io/badge/built%20with-Claude-blueviolet)

## Overview

ShinRacer is a full desktop companion app for Assetto Corsa 1, built to run alongside Content Manager on Windows. It handles the parts of running a private racing crew that Content Manager doesn't: standing up dedicated servers without hand-editing INI files, configuring CSP AI traffic and sol WeatherFX for open-world maps, coordinating race nights, running voice comms, tracking lap times, and browsing replays — all from one app, one design system, one running process.

It's built for a specific crew, not the general public. William (callsign `shinobi`) and a small group of racing and drifting friends run this on a private Tailscale network, with a Raspberry Pi 5 at the center acting as the shared backend for events, chat, and stats. There's no login system because there doesn't need to be one — everyone on the network is already someone who's supposed to be there.

What makes it different from stitching together Discord + a spreadsheet + Content Manager + a track's default traffic config: everything talks to everything else already. Propose an event, and when it goes live you can generate a join invite straight from its detail panel. Launch a server, and the Comms tab is one click away. Complete a session, and your lap times are already in the Stats view before you've alt-tabbed back. No third-party SaaS, no monthly fees, no data leaving the network it was created on.

That's the ShinTech philosophy in general: self-hosted, DIY, built to be understood and modified by the person running it, not subscribed to. If you're the kind of person who'd rather own a Raspberry Pi than pay for a Discord bot, this is written for you.

Every control in the app has a hover tooltip explaining what it actually does — not a restatement of the label, an explanation of the effect. First time in a tab you haven't touched, just hover around.

## Features

### 🏁 Server Manager

Build and deploy AC dedicated servers without touching a single config file by hand. Point it at your AC install, pick a track and cars, and it generates real `server_cfg.ini` / `entry_list.ini` files and launches `acServer.exe` directly.

- Visual track and car selector (scans your actual AC content folders)
- Session config: practice/qualify/race with lap counts and duration
- Driver aids per server: TC, ABS, stability, autoclutch, tyre blankets
- Entry list editor: per-slot car/skin/driver name/GUID assignment
- Live INI preview: watch `server_cfg.ini` and `entry_list.ini` update in real time as you configure
- One-click deploy: writes config files and spawns `acServer.exe`
- Pit board cards: live player count, uptime, PID, real-time log streaming
- stracker UDP plugin toggle

### ✨ Server Builder Wizard

A guided, six-step alternative to the technical Build form, for when you just want to get a server up without thinking about ports and INI keys. Answer a few questions with a bit of personality and it launches (or saves) the exact same config the manual form would have produced.

- Step 1 sets the tone: Race Night, Drift Session, Hotlap Practice, or Cruise — each choice reshapes the copy and defaults in every later step
- Track and car pickers scan your real AC content, same as the manual Build form
- Conditions step: pick weather and time of day from icon cards, including gradient day/night previews
- House rules step: friendly-language driver aid toggles ("Save me from myself" instead of "Traction control"), a driver-count slider with a live vibe label ("Just the boys" → "This is a lot of people"), optional password
- Final step summarizes the whole config in plain English and either launches immediately or saves it to the Garage first
- Reachable from a "✨ Quick build" button in the Build tab or "✨ Build with wizard" in the empty Live Servers view

### 🌆 Traffic Manager

A full editor for CSP AI Traffic and sol WeatherFX configs on open-world maps like Shutoko Revival Project — the kind of tuning that's normally a lot of manual INI editing and trial-and-error reloads.

- Load existing `traffic_config.ini` from any track folder
- Behaviour panel: aggression, speed limits, lane discipline, gaps, spawn distances — every CSP `[BEHAVIOR]` and `[SPAWNING]` key
- Car roster: model/skin/weight/max-count per spawn entry, with a live probability breakdown bar
- 24h density schedule: draggable SVG curve, maps directly to sol WeatherFX `DENSITY_HOUR_XX` keys
- Named profiles: Rush Hour, Quiet Night, Drift Night, plus fully custom profiles
- Save writes `traffic_config.ini` + `settings.json` with a timestamped backup of whatever was there before

### 📅 Events Calendar

Coordinate race nights without a group chat full of "who's in?" messages. Propose an event, and it becomes official once someone besides you accepts.

- Month calendar with color-coded event dots (Proposed / Happening / Past)
- Propose events: name, type, track, cars, required mods list, optional poster image upload
- Accept flow: an event moves from Proposed to Happening once at least one other person accepts
- Edit, cancel, or delete any event — friends-only, no ownership restrictions
- iCal export: download a `.ics` to add to any calendar app
- Friend invite codes: generate a 6-character code plus a QR code to share server access
- 24-hour reminder notifications via Electron's Notification API
- Clear-calendar admin function

### 🎙️ Comms Hub

Voice and text in one panel — no Discord server required.

- WebRTC peer-to-peer voice (full mesh, no relay server needed over Tailscale)
- Device selection: microphone and speaker dropdowns with a live input level meter
- Push-to-talk (rebindable key) or open mic toggle
- Per-peer volume sliders, persisted across sessions
- Speaking indicators with a pulse animation
- Connection state per peer — connected / connecting / failed — with auto-reconnect
- Text chat with history (last 100 messages, persisted on the backend)
- 8 quick-phrase buttons, fully editable in Settings (defaults: "Returning to pits", "I've wrecked, I'm out", and more)

### 📊 Lap Stats

Real telemetry straight from AC's own UDP broadcast — captured, stored, and compared, no third-party plugin required.

- Live UDP capture on port 9996 (enabled in AC's `cfg/cfg.ini`)
- Sector timing: S1/S2/S3 per lap, shown as a stacked bar chart with a personal-best line
- Session leaderboard: rank all drivers by best lap
- Friends comparison: personal best per track, delta highlighted
- Invalid-lap flagging straight from the UDP flags byte, with a toggle to include/exclude them
- Export to CSV or JSON per session
- Recording indicator with a live lap counter

### 🎬 Replay Browser

Browse, tag, and launch AC replays without digging through File Explorer.

- Scans `Documents\Assetto Corsa\replay\` automatically
- Binary header parsing: extracts track, layout, car models, and driver names straight from the `.acreplay` file
- Favorites, tags, and notes per replay, persisted locally
- Suggested tags: race, drift, hotlap, crash, keeper, review
- Search and filter by track, driver, tag, or filename
- Sort by date, track, or file size
- Launch directly into AC with the `-replay` flag
- Metadata cache with mtime-based invalidation, so re-scans stay fast

### 📦 Mod Manager

Download and auto-install mods directly from the ShinTech Drive library.

- Browse Cars, Tracks, and Tools pulled live from a shared Google Drive folder
- One-click install: downloads and extracts straight into your AC content folders
- Update badges when a mod on Drive is newer than what you have installed
- Sign in with Google to upload your own mods for William to review and add to the library
- Live "someone just uploaded a mod" toast for everyone connected
- No login required just to browse and download — sign-in is only for uploading

### 🔗 Useful Links

A curated jumping-off point to the rest of the AC ecosystem, so new crew members aren't left guessing where to find mods, tools, or setup guides.

- Pre-loaded with ~25 hand-picked links across five categories: Tracks & Cars, Tools & Apps, Communities, YouTube, and Setup & Guides — RaceDepartment, Overtake.gg, Content Manager, CSP, sol, CrewChief, the AC subreddit, and more
- Preset links can be hidden (not deleted) if you don't need them cluttering the list — toggle them back on any time
- Add your own links on top, with name/URL/description/category, editable and deletable
- Live search across every link's name, description, and URL
- One-click "Visit" (opens in your default browser, never inside the app) and "Copy" for every link
- Entirely local — the preset library ships in the app itself and your own additions live in local app storage, nothing round-trips to a backend

### 🧙 First-Run Wizard

Zero-friction setup for new crew members — no README required to get running.

- Auto-detects your AC install from default Steam library paths
- Adaptive steps: skips server config entirely if `acServer.exe` isn't found (client-only mode, for friends who race but don't host)
- Identity setup: handle + color, previewed live
- Backend connection: pre-filled URL, auto-tests on mount
- Quick-phrase customization
- Saves nothing until you hit the final "Done" step

## Architecture

```
┌─────────────────────────────────┐
│   ScarlettWitch (Windows 11)    │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Electron + React App    │  │
│  │   (ShinRacer)             │  │
│  └────────────┬──────────────┘  │
│               │ IPC             │
│  ┌────────────▼──────────────┐  │
│  │   Main Process (Node.js)  │  │
│  │   acServer.exe spawner    │  │
│  │   UDP telemetry (9996)    │  │
│  │   accomp:// URL handler   │  │
│  └───────────────────────────┘  │
└──────────────┬──────────────────┘
               │ HTTP + WebSocket
               │ (Tailscale / LAN)
┌──────────────▼──────────────────┐
│   shinobi (Raspberry Pi 5)      │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Node.js + Express       │  │
│  │   Socket.io               │  │
│  │   SQLite (ac_companion.db)│  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**The Electron app** is the whole client experience — React renderer for UI, a Node.js main process for everything that needs real OS access: spawning and monitoring `acServer.exe`, listening for AC's UDP telemetry broadcast, reading/writing AC's own config files, and handling `accomp://` protocol links for invite round-trips. The renderer never touches Node directly — it talks to the main process over Electron's IPC through a `contextBridge`-exposed API.

**The backend** is a small always-on Node service that every client points at, over Tailscale or LAN. It's the one thing that has to be shared: it holds the events calendar, chat history, WebRTC signaling, lap stats, and invite codes in a single SQLite database, and relays realtime events over Socket.io. It runs on a Raspberry Pi 5 (`shinobi`) as a systemd service, but there's nothing Pi-specific about it — any always-on Linux box (or Windows machine) on the network works.

Server Manager, Traffic Manager, and the Replay Browser work entirely offline — they only touch your local AC install and filesystem. Events, Comms, and Stats need the backend, since those are the genuinely shared, multiplayer parts of the app. Mod Manager downloads/browsing need the backend too (it proxies Google Drive), but only uploading needs a Google sign-in.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 28 |
| UI | React 18 + Vite 5 |
| Styling | Inline styles, custom design system (no CSS framework) |
| Backend | Node.js 24 + Express |
| Realtime | Socket.io 4 |
| Database | SQLite via better-sqlite3 |
| Voice | WebRTC (browser APIs, peer-to-peer mesh) |
| Mod library | Google Drive API + OAuth (googleapis) |
| Networking | Tailscale (or LAN) |
| Deployment | Raspberry Pi 5 + systemd |
| Build | electron-builder, GitHub Actions |

## Getting Started

### For the host (William)

**Prerequisites**
- Windows 10/11 x64
- Node.js 24+ ([nodejs.org](https://nodejs.org))
- Assetto Corsa installed via Steam
- A Raspberry Pi (or any always-on Linux box) for the backend
- Tailscale on all devices ([tailscale.com](https://tailscale.com))

**Steps**

```powershell
# 1. Clone the repo
git clone git@github.com:ShinobiFPV/AC1Companion.git
cd AC1Companion

# 2. Install dependencies
npm install
cd backend && npm install && cd ..

# 3. Deploy the backend to your Pi (edit host/user in the script first)
.\scripts\deploy-backend.ps1

# 4. Run the app
npm run dev        # dev mode, hot reload
# or
npm run build       # production installer
```

First launch runs the setup wizard — it auto-detects your AC install, asks for a handle/color, and connects to the backend you just deployed.

### For friends (joining the crew)

1. Get a Tailscale invite from William
2. Download the latest installer from [GitHub Releases](https://github.com/ShinobiFPV/AC1Companion/releases/latest)
3. Run `ShinRacer-Setup-x.x.x.exe` (Windows SmartScreen may warn — the app is unsigned for now, click "More info" → "Run anyway")
4. Follow the setup wizard — handle, color, backend URL (pre-filled, just hit Test Connection)
5. Done — check the Events tab for upcoming sessions

Full step-by-step instructions: **[docs/FRIEND_SETUP.md](docs/FRIEND_SETUP.md)**

## Backend deployment

The backend runs on `shinobi` (a Raspberry Pi 5) as a `systemd` service, so it's always up when someone wants to check Events or jump into Comms.

One-command deploy:

```powershell
.\scripts\deploy-backend.ps1
```

The script copies the backend source files over `scp`, runs `npm install --omit=dev` remotely, restarts the `ac-companion` systemd service, and prints a health check from the freshly restarted service.

First-time setup on a new Pi is manual: copy the backend files, `npm install`, then install `backend/ac-companion.service` into `/etc/systemd/system/` and `systemctl enable --now ac-companion`.

Health check endpoint: `GET /api/health`

## AC Telemetry setup

Lap Stats reads AC's own UDP telemetry broadcast — no plugin needed. Enable it in `cfg.ini`:

```ini
[LIVE_TELEMETRY]
ENABLE=1
APP_ID=race_stats
UDP_PORT=9996
```

This file lives at one of two places, depending on whether you're running vanilla AC or through Content Manager:

```
%LOCALAPPDATA%\AcTools Content Manager\data\cfg\cfg.ini
```
or
```
Documents\Assetto Corsa\cfg\cfg.ini
```

## Traffic Manager setup (SRP example)

Setting up traffic on Shutoko Revival Project, start to finish:

1. Open the **Traffic Manager** tab
2. Click **Browse** and navigate to your track folder, e.g.:
   ```
   Steam\steamapps\common\assettocorsa\content\tracks\shuto_revival_project_beta
   ```
3. Click **Load existing** — the app reads the `traffic_config.ini` that ships with the map
4. Select the **Drift Night** profile, or clone it and customize
5. Adjust the car roster to match whatever JDM car mods you actually have installed
6. Set density peaks on the schedule curve for your usual session time
7. Click **Save to map** — originals are backed up automatically to `data/traffic/backup/`

## Credits

**Design & Development**
William (shinobi) — ShinTech Electronics
Architecture, feature design, UX direction, QA, and deployment.

**Built with Claude**
This project was designed in collaboration with [Claude](https://claude.ai) (Anthropic's AI assistant) and built using [Claude Code](https://claude.ai/code) (Anthropic's agentic coding tool).

The development process: William directed all product decisions — what to build, how it should work, and how it should feel. Claude handled code generation across seven iterative phases, from initial scaffold through production hardening, the Mod Manager, and the current polish pass — an app-wide tooltip system, the Server Builder Wizard, and the Useful Links page. Claude Code executed each phase given a detailed prompt, with William reviewing, testing, and course-correcting between phases.

This is an example of what's possible when a technically-minded builder uses AI as a force multiplier — not to replace judgment, but to ship faster.

**Key technologies**
- [Electron](https://electronjs.org) — desktop shell
- [React](https://react.dev) — UI
- [Socket.io](https://socket.io) — realtime communication
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — database
- [Vite](https://vitejs.dev) — build tooling
- [electron-builder](https://electron.build) — packaging
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — invite QR codes
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) — Google Drive + OAuth for the Mod Manager

**Community**
- The Assetto Corsa modding community for track and car content
- CSP (Custom Shaders Patch) by x4fab
- sol by Peter Boese
- Shutoko Revival Project team
- Content Manager by AcTools

## License

MIT License — see [LICENSE](LICENSE) file.

This project is not affiliated with Kunos Simulazioni or Assetto Corsa. All game content, trademarks, and intellectual property belong to their respective owners.

---
*Built by ShinTech Electronics · Powered by Claude*
