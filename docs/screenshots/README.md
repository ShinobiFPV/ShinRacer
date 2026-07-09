# Screenshot guide

This folder holds the screenshots referenced from the project [README](../../README.md). None of the PNGs are checked in yet — this doc exists so anyone (including future-you) can regenerate the full set consistently.

## How to capture

1. Run the app in dev mode: `npm run dev`
2. Get the app into the state described in the table below for that screenshot
3. Use your OS screenshot tool (Win+Shift+S on Windows) to capture just the app window — no desktop background, no taskbar
4. Save as PNG using the exact filename from the table below
5. Drop it directly into `docs/screenshots/`

Keep the window at a reasonable desktop size (not maximized to 4K, not tiny) so the screenshots stay legible when GitHub scales them down in the README.

## Screenshot checklist

| Filename | View | Setup before capturing |
|----------|------|------------------------|
| `deploy-view.png` | Live Servers | Launch a server first, so the pit board shows live data |
| `build-view.png` | Server Builder — Track tab | Browse to any track |
| `build-view-entry-list.png` | Server Builder — Entry List tab | Select 2+ cars, set 6 slots |
| `traffic-behavior.png` | Traffic Manager — Behaviour | Load SRP, select the Drift Night profile |
| `traffic-schedule.png` | Traffic Manager — Schedule | Same as above |
| `traffic-roster.png` | Traffic Manager — Car Roster | Same as above |
| `events-calendar.png` | Events Calendar | Propose 2-3 test events first |
| `events-detail.png` | Events Calendar — detail panel | Click an event |
| `events-propose.png` | Events Calendar — propose form | Click "Propose event" |
| `comms-voice.png` | Comms — voice panel | Have one other user connected |
| `comms-chat.png` | Comms — chat panel | Send a few messages first |
| `stats-chart.png` | Lap Stats — chart | Complete a session with 5+ laps |
| `stats-comparison.png` | Lap Stats — comparison | Need 2+ drivers with laps |
| `replays-list.png` | Replay Browser | Have 3+ replays in the AC replay folder |
| `replays-detail.png` | Replay Browser — detail | Click a replay, add a tag |
| `wizard-welcome.png` | Install Wizard | Run: `npx electron . --dev --user-data-dir="%TEMP%\wizard-test"` |
| `wizard-identity.png` | Install Wizard — identity | Advance to step 3 |
| `settings.png` | Settings | Scroll to show all sections |

## Notes

- The wizard screenshots need an isolated `--user-data-dir` so they don't touch (or get skipped by) your real, already-completed setup — see the command in the table above.
- Test data for Events/Comms/Stats screenshots should look like a real crew using the app, not a single empty test event — a couple of named test users and a few days of activity looks far more convincing than a fresh database.
- Re-capture a screenshot whenever the view it documents changes visibly enough that the old image would confuse a new reader.
