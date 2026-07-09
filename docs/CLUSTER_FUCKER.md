# The Cluster Fucker

## What it is

A custom button box and dashboard builder, built into ShinRacer. Design your
own panel of buttons, toggles, gauges, and displays, then run it two ways:
as a mouse-driven overlay on your desktop while you race, or as a touchscreen
dashboard on your phone or tablet propped up next to your wheel. Buttons can
send real keystrokes to Assetto Corsa or trigger ShinRacer's own functions —
push-to-talk, quick phrases, launching a server, and more.

The name is exactly what it says. No censoring, no asterisks — it's called
what it's called, everywhere it appears in the app.

## Widget types

| Widget | Input or display | What it does |
|---|---|---|
| Momentary Button | Input | Active only while held. Bind a keystroke or app function. |
| Toggle Button | Input | Stays on/off between presses. Can mirror a telemetry value (e.g. pit limiter) instead of tracking its own state. |
| Momentary Switch | Input | A physical rocker-switch look (SVG), same press/release behavior as a Momentary Button. |
| Rotary Encoder | Input | Click to fire a press action; mouse wheel, two-finger swipe, or a vertical touch-drag steps it clockwise/counter-clockwise. Can display a read-only telemetry value instead. |
| Slider | Input | Horizontal or vertical drag slider. Can display a read-only telemetry value instead. |
| XY Pad | Input | 2D drag area — X and Y axes fire independent actions with a 0-1 value. |
| Indicator Light | Display | A colored circle/square driven entirely by a telemetry value — no input. |
| Gauge | Display | Any of the Telemetry tab's own gauges (speed, RPM, tyres, lap timing, G-force, fuel, damage, and more), dropped straight into your layout. |
| Text Readout | Display | A telemetry value as formatted text (number, lap time, gear, percent, or raw), with your own prefix/suffix. |
| Image Panel | Display | A static background image behind other widgets. |
| Label | Display | Static text — no input, no telemetry. |

## Action bindings

Every input widget's action is one of three types:

- **None** — does nothing (the default, so a half-configured widget never
  fires anything by accident).
- **Keystroke** — sends a real key to whatever has focus (usually AC), e.g.
  `F1`, `ctrl+shift+p`, `h`, `space`. Optionally repeats while held.
  **Desktop overlay only** — a phone can't send a keystroke to your PC, so
  keystroke bindings show a "doesn't work on mobile" message if triggered
  from the PWA.
- **App Function** — triggers something inside ShinRacer itself, from either
  surface:

| Function | What it does | Needs a parameter? |
|---|---|---|
| `ptt.start` / `ptt.stop` | Start/stop push-to-talk | — |
| `mute.toggle` | Toggle your mic mute | — |
| `chat.sendPhrase` | Send a quick phrase by index | Phrase index (0-7) |
| `lap.marker` | Mark the current lap | — |
| `server.launch` | Launch a saved server preset | Preset ID (from Garage) |
| `server.stop` | Stop a running server | Running server ID |
| `telemetry.start` / `telemetry.stop` | Start/stop live telemetry | — |
| `overlay.toggle` | Show/hide the telemetry overlay | Overlay ID (optional) |
| `cluster.toggle` | Show/hide another cluster overlay | Cluster preset ID |
| `volume.up` / `volume.down` | Adjust connected peers' volume | — |
| `ac.openReplay` | Open the Replay Browser | — |
| `ac.launchGame` | Launch Assetto Corsa | — |

A few of these only take effect while a specific tab happens to be open —
see "Not independently verified" in this project's CLAUDE.md Phase 11 notes
for exactly which ones and why (it comes down to where the relevant state,
like your mic's mute flag, actually lives in the app).

## Building a layout

1. Open **Cluster** in the sidebar → **Editor** tab.
2. Drag a widget from the left palette onto the canvas, or click one to drop
   it in the center.
3. Click the widget to open its config panel — colors, label, size, the
   action it fires, and (for display widgets) which telemetry field drives it.
4. Resize with the corner handles, drag to reposition (snaps to the grid;
   hold **Alt** to place pixel-perfectly), and multi-select by dragging a box
   on empty canvas.
5. Adjust canvas size, background, and grid from the right panel.
6. **Save locally** whenever you want — unlimited local presets, no backend
   needed.
7. **Preview** to try it without leaving the editor, or **Launch overlay** to
   open it as a real desktop overlay window right away.
8. **Publish to crew** to make it visible to everyone in the Public Library
   (see limits below).

## Using on mobile

1. Open the ShinRacer PWA on your phone (see the main README or
   [FRIEND_SETUP.md](FRIEND_SETUP.md)) and tap **Cluster** in the bottom nav.
2. Pick a preset from **My presets** or **Public presets**.
3. The layout fills the screen, scaled to fit. Tap **Fullscreen** for an
   immersive view, or **Collapse** to shrink the header down to a thin blue
   strip (tap it to bring the header back).
4. Touch input fires the same actions a mouse click would on desktop.
   Telemetry-bound widgets update roughly twice a second — the ShinRacer
   desktop app has to be open and running live telemetry for any of your
   crew's phones to see real numbers.
5. Keystroke-bound widgets don't work here — a phone has no way to send a
   key to your PC. Build mobile-facing presets around App Function bindings
   instead.

## Preset limits

- **Local presets:** unlimited.
- **Public (crew-visible) presets:** 5 maximum per person, enforced both in
  the editor and on the backend.
- To free up a slot: **Unpublish** (keeps your local copy, just hides it from
  the crew) or **Delete** it entirely.

## Sharing presets

- **QR code:** the editor's **Share QR code** button encodes the preset's
  full layout directly into a QR — works for any preset regardless of
  whether it's published, but only if it's small enough (under ~50KB;
  embedded images are usually what pushes a preset over that). Public
  Library and My Clusters cards for already-published presets can also
  generate a QR from the backend directly.
- **JSON export/import:** **Export JSON** downloads the preset as a file you
  can send any way you like (Discord, email, a USB stick); **Import JSON** in
  My Clusters loads one back in.
- **Public Library:** anything you publish is automatically visible to the
  whole crew — no sharing step needed at all.
