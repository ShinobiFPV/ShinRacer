# Car Stereo Setup

The Car Stereo page (🎵 in the sidebar) streams music from Spotify, YouTube
Music, or Apple Music — or plays local files — and mixes it against your game
audio and Comms voice chat in a three-channel mixer. Nothing here is required
to use the rest of ShinRacer; every section below is independently optional.

## Spotify

Full playback control (play/pause/skip/seek/volume/shuffle/repeat) and search
via the official Spotify Web Playback SDK. **Requires Spotify Premium** —
Spotify's SDK refuses to initialize playback for free accounts.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   and create an app (free).
2. In the app's settings, add this exact Redirect URI:
   `http://127.0.0.1:9722`
3. Copy the app's **Client ID** and **Client Secret**.
4. In ShinRacer: Car Stereo → Settings → Spotify, paste both in, click
   **Save & Connect**.
5. Go to the Sources tab and click **Connect with Spotify** — this opens your
   browser to Spotify's sign-in page and comes back automatically.

The client secret is sent to and held by the ShinRacer backend (same
principle as Google sign-in) — it never touches Spotify's servers from your
machine directly for anything except the SDK's own playback stream.

**Only one Spotify app's credentials are active at a time**, shared by
whichever crew member last clicked Save & Connect on the machine running the
backend — this mirrors how every other backend integration in this app
(Google Drive, Google sign-in) works: one shared app, each person's own
account signs in against it. The saved credentials only last until the
backend process restarts; for a permanent setup, add the same
`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`/`SPOTIFY_REDIRECT_URI` to
`backend/.env` on shinobi (see `.env.example`).

## YouTube Music

No setup required. Car Stereo → Library (with YTM selected as the source) →
**Open YouTube Music**, then sign in normally inside the embedded window.
ShinRacer remembers your session across restarts.

YouTube Music has no public playback API, so control is via an embedded
browser panel rather than a native SDK — play/pause/next work through button
clicks ShinRacer sends into the page, which can break if YouTube changes its
site layout. If a control stops working, the embedded panel itself always
still works as a normal YouTube Music tab.

## Apple Music

**Basic (no setup):** Click **Open Apple Music** in the Library tab and sign
in — same embedded-browser approach as YouTube Music, same limitation (button
clicks into the page, can break on a site redesign).

**Native controls (optional):**
1. Requires an Apple Developer account ($99/year).
2. Create a MusicKit identifier at [developer.apple.com](https://developer.apple.com).
3. Generate a developer token (a signed JWT).
4. Paste it into Car Stereo → Settings → Apple Music → Developer token.

Without the token, Apple Music works fine via the embedded browser — the
token only unlocks MusicKit JS's native transport controls in place of the
button-click approach.

## Game Audio Mixer (GAME channel)

The mixer's GAME channel sets your active game's Windows volume via
[nircmd](https://www.nirsoft.net/utils/nircmd.html), a small free utility
that isn't bundled with ShinRacer (its redistribution terms aren't a fit for
this repo).

1. Download `nircmd.exe` from nirsoft.net/utils/nircmd.html.
2. Place it at `resources/tools/nircmd.exe` inside your ShinRacer install
   folder (next to `resources/tools/README.txt`).
3. Car Stereo → Settings → Game audio will show "✓ nircmd.exe found" —
   click **Test** to confirm it actually runs.

Without nircmd.exe, every other Car Stereo feature (Spotify/YTM/Apple/local
playback, the MUSIC and COMMS mixer channels) still works — only the GAME
channel is disabled, with a clear message explaining why.

## Local files

1. Car Stereo → Sources → Local Files → **Browse**, or Settings → Local
   files → **Browse**.
2. Pick a folder — ShinRacer scans it (including subfolders) for `.mp3`,
   `.flac`, `.wav`, `.ogg`, `.m4a`, and `.aac` files.
3. Metadata (title/artist/album/artwork/duration) is read automatically from
   each file's ID3/FLAC tags.
4. Click any track to play it and build a queue; the Queue tab lets you
   reorder or clear it.

## The mixer

Three channels — MUSIC, GAME, COMMS — plus a MASTER fader, at the bottom of
the Car Stereo page. Drag a fader, double-click to reset to 100%, click **M**
to mute a channel, or **S** on MUSIC to solo it (mutes GAME and COMMS).
**LINK** ties all three channel faders together so they move as one. Four
built-in presets (RACE / CRUISE / STREAM / QUIET) are always available; save
your own from Settings → Mixer presets.

## The Cluster Fucker

Five Car Stereo widgets live under the **AUDIO** category in the Cluster
Fucker's widget palette: Now Playing, Transport, Mixer, Volume Knob, and
Track Info — build them into a custom dashboard or pop-out overlay the same
way as any other widget. Any Momentary Button or Toggle Button can also be
bound to a "Car Stereo: ..." app function if you'd rather wire music controls
into a bespoke button layout than use the dedicated Transport widget.
