# ShinRacer Telemetry Setup

## Supported games

| Game | Protocol | Auto-detect | Setup required |
|------|----------|-------------|-----------------|
| Assetto Corsa 1 | Shared Memory | ✓ | `cfg.ini` change |
| ACC | Shared Memory | ✓ | None — always on |
| AC Evo | Shared Memory | ✓ | None — always on* |
| AC Rally | Shared Memory | ✓ | TBC — struct offsets unconfirmed |
| FH5 | UDP Data Out | ✓ | In-game setting |
| FH6 | UDP Data Out | ✓ | In-game setting |
| F1 25 | UDP Telemetry | ✓ | In-game setting |
| Automobilista 2 | UDP (Project CARS 2 format) | ✓ | In-game setting (Shared Memory toggle) |

\* AC Evo's shared-memory API is in active development (early access). Fields
may change between game updates — see the caveat below.

Auto-detection checks, in order: the game's process name, then a
shared-memory probe (for the AC family), then briefly listening on the
Forza port. If it picks the wrong thing or misses a game entirely, flip
**Settings → Telemetry → Auto-detect game** off and pick the game manually.

## AC1 setup

Enable `[LIVE_TELEMETRY]` in `cfg.ini`:

```ini
[LIVE_TELEMETRY]
ENABLE=1
APP_ID=race_stats
UDP_PORT=9996
```

Find `cfg.ini` here, depending on whether you're running vanilla AC or
through Content Manager:

```
%LOCALAPPDATA%\AcTools Content Manager\data\cfg\cfg.ini
```
or
```
Documents\Assetto Corsa\cfg\cfg.ini
```

(This is only for **Lap Stats**' UDP feed — the Live Telemetry tab's shared
memory reader needs no config at all, same as ACC/AC Evo below.)

## ACC setup

No configuration needed — shared memory is always on. Start ShinRacer, then
start a session in ACC.

## AC Evo setup

No configuration needed — shared memory is on by default. AC Evo is early
access and Kunos can change the shared-memory struct between patches; if the
Live Telemetry tab shows an orange "AC Evo telemetry parse error" banner,
that's what happened — ShinRacer will need an update to match the new
layout. Individual fields fall back to their last known-good value rather
than showing garbage, and the game keeps working normally either way — this
only affects the telemetry display.

## AC Rally setup

Same as AC1 — check whether a `[LIVE_TELEMETRY]` section is needed once you
have the game. AC Rally's telemetry struct isn't well documented anywhere
public yet, so ShinRacer's reader is a best-effort implementation with a few
fields at unconfirmed byte offsets. If no data appears, or a field looks
obviously wrong, that's expected for now — check back after future game
updates, and see this repo's `src/main/telemetry/sources/acRally.js` if
you want to help nail down the real offsets.

## Forza Horizon 5 / 6 setup

1. In-game: **Settings → HUD and Gameplay**
2. **Data Out**: ON
3. **Data Out IP Address**: `127.0.0.1`
4. **Data Out IP Port**: `5300` (or whatever you've set in **Settings →
   Telemetry → Forza Data Out port** in ShinRacer)

⚠️ Forza only supports **one** Data Out destination at a time — it can't
send to two ports simultaneously.

## F1 25 setup

1. In-game: **Game Options → Settings → UDP Telemetry Settings**
2. **UDP Telemetry**: On
3. **UDP Broadcast Mode**: Off
4. **UDP IP Address**: `127.0.0.1`
5. **UDP Send Rate**: 20Hz (recommended)
6. **UDP Format**: `2025`
7. **UDP Port**: `20777` (or whatever you've set in **Settings → Telemetry →
   F1 25 UDP port** in ShinRacer)
8. **Your Telemetry**: Public — needed for full data

⚠️ The exact F1 25 process name (`F1_25.exe`/`F125.exe`) used for auto-detection
hasn't been confirmed against a real install in this environment — if
auto-detect doesn't pick it up while the UDP settings above are correct,
check Task Manager's Details tab for the real name and edit
`src/main/telemetry/gameDetector.js`'s `EXE_NAMES`/`ALT_EXE_NAMES` directly.

## Automobilista 2 setup

1. In-game: **Options → System → Shared Memory → Project CARS 2**
2. That's it — AMS2 broadcasts telemetry automatically over UDP once that's
   enabled. No IP/port entry needed in-game (ShinRacer's **AMS2 UDP port**
   setting only matters if you've changed it from the default `5606`).

⚠️ AMS2's telemetry parsing in this version is a best-effort implementation.
Unlike F1 25 (an officially published, stable spec), Project CARS 2's UDP
payload byte layout wasn't independently verified against a real packet
capture or SDK header — only the packet *header* (packetNumber/packetType/
etc.) is confirmed. If fields look wrong or missing once you've actually
tested this against a real AMS2 session, that's expected for now — see
`src/main/telemetry/sources/ams2.js`'s header comment for exactly which
offsets are unverified guesses.

## Q2 integration note

Q2 (William's other project — a voice-first AI companion) has its own
Forza-telemetry-based race engineer feature, listening on UDP port **8000**.
ShinRacer's Forza telemetry defaults to a different port, **5300**, so the
two don't fight over the same port by default.

Because Forza can only send to one destination, running both apps' Forza
features *at the same time* still isn't possible — point Forza at whichever
port matches whichever app you want live data in at that moment, or run
them at separate times. There's no telemetry relay/splitter between the two
apps; that's a real gap, not an oversight, and would need its own small UDP
fan-out utility if it's ever worth building.

## Verifying it worked

- **Settings → Telemetry → Test telemetry** starts the telemetry manager,
  waits 3 seconds, and reports either "✓ {game} detected" or "✗ No game
  detected" — the fastest way to check without opening the full tab.
- The Live Telemetry tab's LIVE header shows a colored game badge (AC1,
  ACC, AC EVO, AC RALLY, FH5, FH6, F1 25, AMS2, or DEMO) once telemetry is
  flowing — DEMO means no real game was found and you're looking at
  simulated data.
- For Forza specifically: if the badge never leaves DEMO after enabling
  Data Out, double check the port in-game matches Settings' Forza Data Out
  port exactly, and that no firewall rule is blocking local UDP traffic on
  that port.
