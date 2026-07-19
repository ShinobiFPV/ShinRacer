# Joining the ShinTech AC Crew

## Step 1 — Get on Tailscale
Download Tailscale: https://tailscale.com/download
William will send you an invite link to join the network.

## Step 2 — Get added to the crew list
ShinRacer requires a Google sign-in — send William the Google account
you'll sign in with (usually just your regular Gmail) so he can add it to
the crew list. You'll land on an "ACCESS RESTRICTED" screen for
Host/Admin-only features until then, but Events, Comms, Stats, Mods, and
Links all work as soon as you've signed in — being on the crew list isn't
required for baseline access, only for the Host/Admin-only stuff.

## Step 3 — Download ShinRacer
Go to: https://github.com/ShinobiFPV/ShinRacer/releases/latest
Two installers are on that page — pick one:
- **ShinRacer Setup x.x.x.exe** — everything (servers, traffic, events,
  comms, mods, stats, telemetry, replays, and more)
- **ShinRacer Lite Setup x.x.x.exe** — just servers/events, mods, comms,
  and traffic management, for casual crew who don't need the rest
Run the installer — Windows may show a SmartScreen warning,
click "More info" → "Run anyway" (the app is unsigned for now).
Not sure which one to pick, or want to switch later? Both installs share
the same account and backend, and Full has a Lite Mode toggle in Settings
that hides the same items at runtime — no reinstall needed to try it.

## Step 4 — Sign in
On first launch, the setup wizard walks you through:
1. **Sign in with Google** — this is the only identity ShinRacer uses now;
   your handle and crew color are set up right after, using your Google name
   as a starting point (both are yours to change later in Settings).
2. **Backend connection** — pre-filled, just hit Test Connection.
3. If you're a Host or Admin, two extra steps appear: AC path detection and
   a host-readiness check. Everyone else skips straight past these.

## Step 5 — You're in
Check the Events tab to see what's coming up.
Join Comms to talk to the crew.

Note: Server hosting and Lap Stats require Assetto Corsa installed. Hosting
a game server for crew events additionally requires the Host role — ask
William if you want to be able to volunteer your PC for that (see
[docs/ADMIN_SETUP.md](ADMIN_SETUP.md)).

## Option B — Mobile / PWA (no install needed)
If you're on mobile or just want to check events and chat:
1. Join Tailscale (Step 1 above still required)
2. Open https://your-pi.tail9249a1.ts.net:8443 in your browser — **use this
   HTTPS URL, not the plain http://192.168.1.100:8080 one.** Google sign-in
   only works over HTTPS; the plain-HTTP address still loads the app but
   sign-in will fail there.
3. Sign in with Google when the onboarding flow asks — same as the desktop
   app, this is required, not optional; there's no guest/browse-only mode
4. Tap Add to Home Screen
5. Done — ShinRacer is on your home screen

Full walkthrough: [PWA_SETUP.md](PWA_SETUP.md).
