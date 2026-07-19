# Android TWA (ShinRacer wrapped as an installable app)

`android-twa/` wraps the PWA (`pwa/`, see `docs/PWA_SETUP.md`) in a **Trusted
Web Activity** using [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
— a real Android app (`com.shintech.shinracer.twa`) that opens the live PWA
full-screen, no browser chrome, no URL bar. It is **not** a bundled copy of
the app: the APK contains almost no code of its own, just a launcher that
points Chrome at `https://your-pi.tail9249a1.ts.net:8443` and Android's own
Digital Asset Links check that lets it hide the URL bar. This means **most
PWA changes need no Android rebuild at all** — see "When do I need to
rebuild" below.

This is a sideload-only distribution, same trust model as the Windows
installer — no Google Play Store involvement, no Play Console, no app
review. Friends install the APK directly, same as they'd run
`ShinRacer-Setup-*.exe` on Windows.

## The moving pieces

- **`android-twa/`** — the generated Gradle/Android Studio project (source
  is committed; build outputs, the keystore, and its password are not — see
  `.gitignore`). `twa-manifest.json` is Bubblewrap's own config file and is
  the one to hand-edit for most changes (app name, colors, version).
- **`android-twa/android.keystore`** — the production signing key.
  **Gitignored, exists only on this machine, and is not backed up anywhere
  else yet.** If this file and its password are both lost, the app can
  never be updated again under `com.shintech.shinracer.twa` — a reinstall
  would be a different app to Android (different signature), and everyone
  would have to uninstall the old one first. **Back up `android.keystore`
  and `.keystore-credentials.txt` (both in `android-twa/`, both gitignored)
  to a password manager or offline copy before this matters.**
- **`https://your-pi.tail9249a1.ts.net:8443/.well-known/assetlinks.json`**
  — proves to Android that this APK and that HTTPS origin are the same
  publisher (package name + the keystore's SHA-256 cert fingerprint).
  Without this, the app still works, but Chrome shows the URL bar like a
  normal browser tab instead of hiding it. Served as a plain static file by
  `backend/nginx/shinracer.conf`'s `location = /.well-known/assetlinks.json`
  block — deploy that file the same way as any other nginx config change
  (see `docs/PWA_SETUP.md` / `scripts/deploy-pwa.ps1`'s pattern) if this
  block is ever edited.
- **`https://your-pi.tail9249a1.ts.net:8443/shinracer.apk`** — the signed
  APK itself, copied there by hand (not by `deploy-pwa.ps1`) so a phone can
  download and install it directly from a URL. Served with
  `Content-Type: application/vnd.android.package-archive` and
  `Cache-Control: no-cache` (see the matching `location = /shinracer.apk`
  block in `shinracer.conf`) so a stale cached copy never lingers after a
  rebuild.

## When do I need to rebuild the APK

**Not needed** for almost everything — logo/theme changes aside, TWA just
opens the live PWA, so any change deployed via `deploy-pwa.ps1` (new
features, bug fixes, new views) is live for TWA users the next time they
open the app, same as any other website.

**Rebuild needed** only when:
- `pwa/public/manifest.json`'s `name`, `theme_color`, `background_color`,
  or icons change (these are baked into the APK as native Android
  resources at build time, not read live).
- You want to bump the Android version number shown in Settings/Play-style
  "About" (`appVersionCode`/`appVersionName` in `twa-manifest.json`) —
  cosmetic only, nothing enforces this today since there's no auto-updater
  for the APK (see "No auto-update" below).
- The signing key ever needs to rotate (shouldn't happen — see the keystore
  warning above).

## Rebuilding

Everything below assumes the same machine this was first built on (William's
Windows dev box) — see "Environment quirks" for why a fresh machine needs
some one-time setup first.

```
cd android-twa
export PATH=".;$PATH"   # see "Environment quirks" — required every session
export BUBBLEWRAP_KEYSTORE_PASSWORD=<from .keystore-credentials.txt>
export BUBBLEWRAP_KEY_PASSWORD=<same value>
npx bubblewrap build
```

This regenerates `app-release-signed.apk` and `app-release-bundle.aab` in
`android-twa/`. If `twa-manifest.json` changed since the last build,
`bubblewrap build` will offer to run `bubblewrap update` first (regenerates
the Android project from the manifest) — accept it.

Then push the new APK live:

```
scp android-twa/app-release-signed.apk your-pi@192.168.1.100:/var/www/shinracer-pwa/shinracer.apk
ssh your-pi@192.168.1.100 "chmod 644 /var/www/shinracer-pwa/shinracer.apk"
```

No nginx reload needed for this step — only editing `shinracer.conf` itself
needs a reload (see `docs/PWA_SETUP.md`).

### If you ever need to add a second fingerprint (e.g. rebuilding release
signing) or regenerate `assetlinks.json`

```
npx bubblewrap fingerprint add <SHA256_FINGERPRINT>
scp android-twa/assetlinks.json your-pi@192.168.1.100:/var/www/shinracer-pwa/.well-known/assetlinks.json
ssh your-pi@192.168.1.100 "chmod 644 /var/www/shinracer-pwa/.well-known/assetlinks.json"
```

Get a keystore's SHA-256 fingerprint with:

```
"C:/Users/billk/jdk17/bin/keytool.exe" -list -v -keystore android.keystore -alias shinracer -storepass <password>
```

## Installing on a phone (sideload)

1. On the phone, browse to `https://your-pi.tail9249a1.ts.net:8443/shinracer.apk`
   (must be on the Tailscale tailnet — this URL isn't public).
2. Android will prompt to allow installs from this source the first time
   (Chrome > Settings > "Install unknown apps") — this is expected, same
   trust model as the Windows `.exe` installer, not a sign anything's wrong.
3. Install. The app opens full-screen with no URL bar once
   `assetlinks.json` verification passes (may take a moment on first
   launch — Android caches the verification result after that).

If the URL bar shows up instead of a clean full-screen app, it means
Digital Asset Links verification failed — check
`https://your-pi.tail9249a1.ts.net:8443/.well-known/assetlinks.json` is
reachable and its `package_name`/`sha256_cert_fingerprints` match
`android-twa/twa-manifest.json`'s `packageId`/`fingerprints`.

## No auto-update

Unlike the Windows app (`electron-updater`, see `docs/RELEASING.md`), there
is currently no update mechanism for the APK — reinstalling
`shinracer.apk` over itself works (same package id, same signature) but
nothing prompts a user to do it. If this needs proper versioning later, the
same GitHub Releases pipeline the Windows installers already use
(`.github/workflows/release.yml`) would be the natural place to add an
Android build job — not done in this pass since it needs an Android SDK on
the CI runner and a decision about whether to script the whole
`bubblewrap build` step or just build the Gradle project directly with
`actions/setup-java` + `android-actions/setup-android`.

## Environment quirks found while building this (read before rebuilding
on a different machine)

Three real, reproducible problems were hit getting `bubblewrap build` to
work on this Windows machine — all three need to be dealt with again on
any other machine that ever rebuilds this project:

1. **`bubblewrap doctor` needs `~/.bubblewrap/config.json` written by
   hand**, not through the interactive `bubblewrap init`/config wizard
   (there's no way to answer prompts non-interactively in this workflow).
   Content:
   ```json
   {"jdkPath":"<jdk-root>","androidSdkPath":"<sdk-root>"}
   ```
   Use forward slashes — a Windows-style `C:\...` path with single
   backslashes is invalid JSON and `bubblewrap` fails with a cryptic
   `Bad escaped character in JSON` error.

2. **Bubblewrap's `AndroidSdkTools.validatePath` only accepts an SDK root
   that has a `tools/` or `bin/` folder directly inside it** — a modern SDK
   layout (cmdline-tools installed under `cmdline-tools/latest/bin/`) fails
   this check even though it's a perfectly valid SDK. Fixed with a
   directory junction so both paths resolve to the same files:
   ```
   mklink /J "<sdk-root>\bin" "<sdk-root>\cmdline-tools\latest\bin"
   ```
   Also needs `build-tools;34.0.0` installed specifically (Bubblewrap
   hardcodes this version, even if a newer one like 35.0.0 is also
   installed):
   ```
   "<sdk-root>\cmdline-tools\latest\bin\sdkmanager.bat" "build-tools;34.0.0"
   ```

3. **This machine's `cmd.exe` doesn't implicitly search the current
   directory** for a bare command name (`NoDefaultCurrentDirectoryInExePath`
   — a security hardening setting), but Bubblewrap's `GradleWrapper` always
   invokes bare `gradlew.bat` with no `.\` prefix. Without a fix, `bubblewrap
   build` fails immediately with `'gradlew.bat' is not recognized...`.
   Fixed by prepending `.` to `PATH` for the build session only (does **not**
   change any system/global setting):
   ```
   export PATH=".;$PATH"
   ```
   This must be set in the same shell session as the `npx bubblewrap build`
   call every time — it does not persist.

4. **A related, separate bug**: if the configured JDK's path contains a
   space (e.g. the default `C:\Program Files\Microsoft\jdk-...`), the
   `apksigner` signing step fails with `'C:\Program' is not recognized...`
   — Bubblewrap doesn't quote the `java.exe` path it shells out to on
   Windows ([known upstream
   issue class](https://issuetracker.google.com/issues/150888434), the
   exact thing bubblewrap's own code comments say they're working around
   for a *different* case but missed this one). Fixed the same way as the
   SDK path — a space-free junction, then pointing `config.json` at that
   instead:
   ```
   mklink /J "C:\Users\<you>\jdk17" "<real jdk path with spaces>"
   ```
   and set `jdkPath` in `~/.bubblewrap/config.json` to the junction path.

None of these are ShinRacer-specific — they're generic Bubblewrap-on-Windows
issues, reproducible on any Windows machine with a similarly hardened `cmd.exe`
or a JDK installed under `Program Files`. If `bubblewrap doctor` passes but
`bubblewrap build` still fails with either of the errors above, this is why.
