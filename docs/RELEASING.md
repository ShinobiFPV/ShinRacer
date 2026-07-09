# Releasing ShinRacer

ShinRacer ships as a single NSIS installer (`ShinRacer Setup {version}.exe`)
published to GitHub Releases. There's no portable build and no zip — one
installer, one download link, per the app's "no other software required"
promise to friends.

## How a release happens

1. Bump the version and push a tag — one command does both:
   ```powershell
   npm run version:patch   # 1.0.0 -> 1.0.1, bug fixes
   npm run version:minor   # 1.0.0 -> 1.1.0, new features
   npm run version:major   # 1.0.0 -> 2.0.0, breaking changes
   ```
   Each of these bumps `package.json`'s version, commits it
   (`Release v{version}`), tags it (`v{version}`), and pushes both the
   commit and the tag.
2. Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml` on a
   `windows-latest` runner:
   - `npm install`
   - `npm run release` → `vite build && electron-builder --publish always`,
     which builds the renderer, packages the NSIS installer, and publishes it
     straight to a GitHub Release matching the tag (electron-builder handles
     the GitHub API calls itself, given `GH_TOKEN`).
   - A follow-up step replaces electron-builder's auto-generated release
     notes (just the tag name) with `.github/release-template.md`, filling
     in the version.
3. Edit the published release on GitHub to fill in the **What's new**
   section the template leaves blank — that's the one manual step left.

## Local dry runs

Before tagging a real release, you can build the installer locally without
publishing anything:

```powershell
npm run release:dry
```

This runs the exact same `vite build && electron-builder` pipeline but with
`--publish never` — the installer lands in `release/` locally, nothing
touches GitHub. Use this to sanity-check a build before cutting a tag,
especially after touching `package.json`'s `build` config,
`resources/installer.nsh`, or anything under `resources/`.

## What's in the installer

- `dist/**/*` — the built Vite renderer bundle.
- `src/main/**/*` — the Electron main process (not bundled/minified, run
  directly by Electron under `main`).
- `resources/**/*` — icon, license, and the custom NSIS script (see below).
- `backend/**/*` (as `extraResources`) — the Node backend source is bundled
  into the installed app's resources folder. This is *not* the running
  production backend (that's a separate systemd deploy on shinobi via
  `scripts/deploy-backend.ps1`) — it's there so the Electron app always ships
  with a matching copy of the backend's route/schema shape for reference,
  and so a future "run your own backend" path has everything it needs
  without a second download.

## Custom installer behavior (`resources/installer.nsh`)

electron-builder's NSIS installer is mostly auto-generated, but splices in
four macros from this file if present:

- `customHeader` — sets the installer window's branding text.
- `customInit` — force-closes a running `ShinRacer.exe` before installing
  over it (installing over a locked exe otherwise fails partway through with
  a confusing "file in use" error).
- `customInstall` — currently a no-op; settings/identity live in
  electron-store under `%APPDATA%`, created on first launch, not by the
  installer.
- `customUnInstall` — asks (Yes/No) whether to also delete
  `%APPDATA%\ShinRacer` (settings, identity, saved server profiles, logs)
  before finishing the uninstall, rather than silently keeping or wiping it.

`resources/license.txt` (the same MIT license as the repo root's `LICENSE`)
is shown as the installer's license page —
`package.json`'s `build.nsis.license` points at it.

## Known gap

`resources/icon.ico` is referenced by `package.json` (`build.win.icon`,
`build.nsis.installerIcon`) but doesn't exist in the repo yet — this
predates Phase 12 and wasn't part of its scope. A real `electron-builder`
run will fail on the missing icon until one's added; `npx vite build` and
`node --check` (which don't touch electron-builder) both still pass and are
what every phase's own verification has relied on so far. Add a real
`.ico` file at that path before the first real `npm run release`.

## Verifying a release worked

- The GitHub Release for the new tag has exactly one asset:
  `ShinRacer Setup {version}.exe`.
- The release body matches `.github/release-template.md` with the version
  substituted in, not electron-builder's default "vX.Y.Z" placeholder text.
- Running the installer on a clean machine: SmartScreen warning is expected
  (the app is unsigned) — "More info" → "Run anyway" — then the app installs,
  launches, and lands on the Google sign-in wizard.
