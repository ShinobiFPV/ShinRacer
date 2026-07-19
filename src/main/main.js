const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell, Notification, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const dgram = require('dgram')
const net = require('net')
const http = require('http')
const crypto = require('crypto')
const { spawn, execSync, execFileSync, exec } = require('child_process')
const Store = require('electron-store')
const { autoUpdater } = require('electron-updater')
const { getGatewayClient } = require('./upnp')

const isDev = process.argv.includes('--dev')
const store = new Store()

// ── Running server processes (pid → { process, config }) ─────────────────────
const runningServers = new Map()

// ── Per-server player-count pollers (id → intervalId) ─────────────────────────
const playerPollers = new Map()

// ── Content Manager wrapper servers (id → { server, port }) ──────────────────
const cmWrappers = new Map()

// ── UPnP port-mapping status (id → { mapped, externalIp, cgnat, error, ports }) ─
const upnpMappings = new Map()

// ── UDP telemetry socket ──────────────────────────────────────────────────────
let telemetrySocket = null

// ── Telemetry overlay window ──────────────────────────────────────────────────
let overlayWindow = null

// ── Cluster Fucker overlay window ─────────────────────────────────────────────
let clusterOverlayWindow = null

// ── Car Stereo (Phase 18): embedded BrowserViews for YouTube Music / Apple
// Music (neither has a real playback API — see CLAUDE.md's Phase 18 notes)
// and the Spotify OAuth loopback server. ─────────────────────────────────────
let ytmView = null
let appleView = null

// ── The Cluster Fucker: keystroke dispatch ────────────────────────────────────
// Verified in this environment: `npm install robotjs` succeeds (a prebuilt
// binary exists for this Node/win32 combo), and — critically — it also
// `require()`s successfully from *inside a real Electron 28 main process*
// (tested with a throwaway `npx electron` script that called
// `robot.getScreenSize()` and got a real result back), not just from plain
// Node. That's the actual question the spec asked to check, since Electron
// bundles its own Node ABI that's usually a different version than the
// system's — a module built against the wrong ABI normally fails to load
// with a NODE_MODULE_VERSION mismatch, and it didn't. robotjs is the primary
// path. The PowerShell SendKeys fallback below still exists and engages
// automatically if `require('robotjs')` ever throws (e.g. a crew member's
// machine without a matching prebuilt binary) — same defensive posture as
// every other native-dependency decision in this codebase.
let robot = null
try {
  robot = require('robotjs')
} catch (e) {
  log(`robotjs unavailable, falling back to PowerShell SendKeys for cluster keystrokes: ${e.message}`)
}

// Splits 'ctrl+shift+p' into robotjs's { key, modifiers } shape.
function parseKeyBinding(keyStr) {
  const modifierMap = { ctrl: 'control', control: 'control', shift: 'shift', alt: 'alt', cmd: 'command', command: 'command' }
  const keyAliases = { esc: 'escape', spacebar: 'space', return: 'enter', del: 'delete' }
  const parts = keyStr.toLowerCase().split('+').map(p => p.trim())
  const modifiers = []
  let key = null
  for (const p of parts) {
    if (modifierMap[p]) modifiers.push(modifierMap[p])
    else key = p
  }
  return { key: keyAliases[key] || key, modifiers }
}

// PowerShell's SendKeys mini-language is unrelated to robotjs's — ^/+/% are
// modifier prefixes (ctrl/shift/alt) and function/special keys need brace
// wrapping ({F1}, {ENTER}, ...); everything else sends literally.
function toSendKeysFormat(keyStr) {
  const special = { space: '{SPACE}', enter: '{ENTER}', esc: '{ESC}', escape: '{ESC}', tab: '{TAB}',
    up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', backspace: '{BACKSPACE}', delete: '{DEL}' }
  const parts = keyStr.toLowerCase().split('+').map(p => p.trim())
  let prefix = ''
  let key = null
  for (const p of parts) {
    if (p === 'ctrl' || p === 'control') prefix += '^'
    else if (p === 'shift') prefix += '+'
    else if (p === 'alt') prefix += '%'
    else key = p
  }
  let keyPart
  if (/^f([1-9]|1[0-2])$/.test(key)) keyPart = `{${key.toUpperCase()}}`
  else if (special[key]) keyPart = special[key]
  else keyPart = key
  return prefix + keyPart
}

function sendKeyViaSendKeys(keyStr) {
  const sendKeysStr = toSendKeysFormat(keyStr).replace(/'/g, "''")
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr}')`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
}

// ── Reminder notifications: event ids we've already notified for this run ────
const notifiedEventIds = new Set()

// ShinRacer Lite (see electron-builder-lite.yml) is the same main process
// packaged under a different productName — electron-builder sets the
// packaged app's name to productName, so this is reliable with no extra
// build-time plumbing on the main-process side.
const IS_LITE = app.getName() === 'ShinRacer Lite'

// ── Logging ───────────────────────────────────────────────────────────────────
// app.getName() (not a hardcoded 'ShinRacer') so Lite's logs land in their
// own %APPDATA%\ShinRacer Lite\logs instead of colliding with Full's.
const LOG_DIR = path.join(app.getPath('appData'), app.getName(), 'logs')
let logStream = null

function initLogging() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const now = Date.now()
  try {
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f)
      if (now - fs.statSync(full).mtimeMs > 5 * 24 * 60 * 60 * 1000) fs.unlinkSync(full)
    }
  } catch (e) { /* best-effort cleanup */ }
  const today = new Date().toISOString().slice(0, 10)
  logStream = fs.createWriteStream(path.join(LOG_DIR, `main-${today}.log`), { flags: 'a' })
}

function log(line) {
  logStream?.write(`[${new Date().toISOString()}] ${line}\n`)
}

// ── Window ────────────────────────────────────────────────────────────────────
let win

function isWithinDisplayBounds(bounds) {
  return screen.getAllDisplays().some(d => {
    const a = d.bounds
    return bounds.x >= a.x && bounds.y >= a.y &&
      bounds.x + bounds.width <= a.x + a.width &&
      bounds.y + bounds.height <= a.y + a.height
  })
}

function createWindow() {
  const saved = store.get('windowState')
  const windowOpts = {
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#8C8C8C',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../../resources/icon.ico')
  }

  if (saved && isWithinDisplayBounds(saved)) {
    Object.assign(windowOpts, { x: saved.x, y: saved.y, width: saved.width, height: saved.height })
  }

  win = new BrowserWindow(windowOpts)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.on('close', () => {
    store.set('windowState', win.getBounds())
  })

  win.on('closed', () => {
    // Kill all server processes on window close
    for (const [id, entry] of runningServers) {
      try { entry.process.kill() } catch (e) {}
    }
    for (const id of playerPollers.keys()) stopPlayerPolling(id)
    for (const id of cmWrappers.keys()) stopCmWrapper(id)
    for (const id of upnpMappings.keys()) stopUpnpMapping(id).catch(() => {})
    if (telemetrySocket) {
      try { telemetrySocket.close() } catch (e) {}
      telemetrySocket = null
    }
    stopShmTelemetry()
    if (overlayWindow) {
      try { overlayWindow.close() } catch (e) {}
      overlayWindow = null
    }
    if (clusterOverlayWindow) {
      try { clusterOverlayWindow.close() } catch (e) {}
      clusterOverlayWindow = null
    }
    closeOAuthCallbackServer()
    closeSpotifyCallbackServer()
    if (ytmView) { try { win.removeBrowserView(ytmView) } catch (e) {} ytmView = null }
    if (appleView) { try { win.removeBrowserView(appleView) } catch (e) {} appleView = null }
  })
}

// ── Auto-updater (Phase 16) ───────────────────────────────────────────────────
// Replaces Phase 5's minimal checkForUpdatesAndNotify() + native
// Notification/dialog flow with a richer one the renderer drives: main.js
// only forwards updater events over IPC (updater:status/updater:progress),
// and UpdateBanner.jsx / SettingsView's UpdateSection own all the actual UI.
// This is a deliberate replacement of that Phase 5 mechanism, not an
// accidental touch of a working feature — the old Notification/dialog pair
// and this new banner would otherwise double-notify the user for the same
// event.
function configureAutoUpdater() {
  // Silent background check — no dialog unless update is found.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = console
  // Full and Lite both publish to the same GitHub repo (see
  // electron-builder-lite.yml) — without separate channels, each would
  // risk overwriting or being offered the other's release metadata.
  // Full stays on the default 'latest' channel (unchanged behavior).
  if (IS_LITE) autoUpdater.channel = 'lite'

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[updater] Up to date (${info.version})`)
    log(`Updater: up to date (${info.version})`)
    win?.webContents.send('updater:status', { status: 'up-to-date', version: info.version })
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`)
    log(`Updater: update available (${info.version})`)
    win?.webContents.send('updater:status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || null,
      releaseDate: info.releaseDate || null,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    win?.webContents.send('updater:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`)
    log(`Updater: update downloaded (${info.version})`)
    win?.webContents.send('updater:status', {
      status: 'downloaded',
      version: info.version,
      releaseNotes: info.releaseNotes || null,
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
    // Only send to renderer if it's not a network error (no internet =
    // don't bother the user) — still logged to the rolling log either way.
    log(`Updater error: ${err.message}`)
    const isNetworkError = err.message?.includes('net::') ||
      err.message?.includes('ENOTFOUND') ||
      err.message?.includes('ECONNREFUSED') ||
      err.message?.includes('ETIMEDOUT')
    if (!isNetworkError) {
      win?.webContents.send('updater:status', { status: 'error', error: err.message })
    }
  })

  // Check on launch, then every 4 hours.
  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true) // isSilent=false (show progress), isForceRunAfter=true (relaunch)
})

ipcMain.handle('updater:checkNow', async () => {
  try {
    await autoUpdater.checkForUpdates()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('updater:getVersion', () => app.getVersion())

// ── accomp:// protocol (invite links + direct "Connect in AC" round-trips) ────
// Windows launches a fresh process for a protocol click; if we're already
// running, that second process's argv arrives here via 'second-instance'
// instead — requestSingleInstanceLock() is what makes that handoff happen.
// Google OAuth no longer uses accomp:// — Google's Desktop-app policy
// rejects custom URI scheme redirects, so sign-in now goes through the
// loopback HTTP callback server below instead (see 'auth:startCallbackServer').
// accomp:// itself stays registered for invite links and other deep links.
function handleAccompUrl(url) {
  log(`accomp:// URL received: ${url}`)
  // Cluster Fucker QR/share deep link: accomp://cluster/{presetId} — the
  // renderer owns opening ClusterView and fetching the preset from the
  // backend.
  const clusterMatch = url.match(/^accomp:\/\/cluster\/([^/?]+)/i)
  if (clusterMatch) {
    win?.webContents.send('cluster:loadPreset', { presetId: clusterMatch[1] })
    return
  }
  win?.webContents.send('accomp:open', url)
}

// ── OAuth loopback callback server ────────────────────────────────────────────
// Google's OAuth 2.0 policy for "Desktop app" clients rejects custom URI
// scheme redirects (accomp://oauth) with a 400: invalid_request at the
// consent screen — the documented, supported mechanism is a loopback IP
// address redirect instead:
// https://developers.google.com/identity/protocols/oauth2/native-app
// Port 9721 is fixed (not randomized) so it only needs registering once in
// Google Cloud Console and any local firewall rule — matches
// src/renderer/lib/auth.js's OAUTH_CALLBACK_PORT constant exactly (main.js
// is CommonJS and can't import that ES module directly, so the number is
// duplicated here rather than shared).
const OAUTH_CALLBACK_PORT = 9721
let oauthCallbackServer = null

const OAUTH_CALLBACK_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #050507; color: #E8F0FF;
           font-family: 'Space Mono', 'Courier New', monospace;
           display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; }
    h1 { font-family: 'Rubik Mono One', 'Courier New', monospace; font-size: 32px; letter-spacing: 2px; }
    p  { color: #5A6475; }
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>SIGNED IN</h1>
    <p>You can close this tab and return to ${app.getName()}.</p>
  </div>
</body>
</html>`

function closeOAuthCallbackServer() {
  if (oauthCallbackServer) {
    try { oauthCallbackServer.close() } catch (e) {}
    oauthCallbackServer = null
  }
}

ipcMain.handle('auth:startCallbackServer', () => {
  closeOAuthCallbackServer() // a stale server from a previous attempt/timeout, if any
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`)
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(OAUTH_CALLBACK_HTML)
      if (code) win?.webContents.send('oauth:callback', code)
      closeOAuthCallbackServer()
    })
    server.on('error', (err) => {
      log(`OAuth callback server error: ${err.message}`)
      oauthCallbackServer = null
    })
    server.listen(OAUTH_CALLBACK_PORT, '127.0.0.1', () => {
      oauthCallbackServer = server
      resolve({ ok: true })
    })
  })
})

ipcMain.handle('auth:stopCallbackServer', () => {
  closeOAuthCallbackServer()
  return { ok: true }
})

// ── Spotify OAuth loopback callback server (Car Stereo, Phase 18) ────────────
// Same loopback pattern as the Google sign-in server above, on a different
// fixed port (9722) so the two never collide — Spotify's own OAuth policy for
// this app type also requires a real redirect URI, not a custom scheme.
const SPOTIFY_CALLBACK_PORT = 9722
let spotifyCallbackServer = null

const SPOTIFY_CALLBACK_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #050507; color: #E8F0FF;
           font-family: 'Space Mono', 'Courier New', monospace;
           display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; }
    h1 { font-family: 'Rubik Mono One', 'Courier New', monospace; font-size: 32px; letter-spacing: 2px; color: #1DB954; }
    p  { color: #5A6475; }
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>CONNECTED TO SPOTIFY</h1>
    <p>You can close this tab and return to ${app.getName()}.</p>
  </div>
</body>
</html>`

function closeSpotifyCallbackServer() {
  if (spotifyCallbackServer) {
    try { spotifyCallbackServer.close() } catch (e) {}
    spotifyCallbackServer = null
  }
}

ipcMain.handle('spotify:startAuth', () => {
  closeSpotifyCallbackServer()
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${SPOTIFY_CALLBACK_PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(SPOTIFY_CALLBACK_HTML)
      if (code) win?.webContents.send('spotify:callback', code)
      else if (error) log(`Spotify OAuth error: ${error}`)
      closeSpotifyCallbackServer()
    })
    server.on('error', (err) => {
      log(`Spotify callback server error: ${err.message}`)
      spotifyCallbackServer = null
    })
    server.listen(SPOTIFY_CALLBACK_PORT, '127.0.0.1', () => {
      spotifyCallbackServer = server
      resolve({ ok: true })
    })
  })
})

ipcMain.handle('spotify:stopAuth', () => {
  closeSpotifyCallbackServer()
  return { ok: true }
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    const url = argv.find(a => a.startsWith('accomp://'))
    if (url) handleAccompUrl(url)
  })

  app.whenReady().then(() => {
    initLogging()
    log('App started')
    if (isDev) {
      app.setAsDefaultProtocolClient('accomp', process.execPath, [path.resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient('accomp')
    }
    createWindow()
    const startupUrl = process.argv.find(a => a.startsWith('accomp://'))
    if (startupUrl) handleAccompUrl(startupUrl)
    if (!isDev) configureAutoUpdater()
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}

// ── IPC: Settings ─────────────────────────────────────────────────────────────
ipcMain.handle('store:get', (_, key) => store.get(key))
ipcMain.handle('store:set', (_, key, value) => { store.set(key, value); return true })
ipcMain.handle('store:getAll', () => store.store)

// ── IPC: File dialogs ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async (_, opts = {}) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: opts.title || 'Select Folder',
    defaultPath: opts.defaultPath || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa'
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openFile', async (_, opts = {}) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: opts.filters || [],
    title: opts.title || 'Select File',
    defaultPath: opts.defaultPath
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p))
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))

// ── IPC: Filesystem ───────────────────────────────────────────────────────────
ipcMain.handle('fs:exists', (_, p) => fs.existsSync(p))
ipcMain.handle('fs:readFile', (_, p) => {
  try { return { ok: true, data: fs.readFileSync(p, 'utf8') }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('fs:writeFile', (_, p, data) => {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, data, 'utf8')
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('fs:readDir', (_, p) => {
  try { return { ok: true, files: fs.readdirSync(p) }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('fs:copyFile', (_, src, dest) => {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('fs:makeDir', (_, p) => {
  try { fs.mkdirSync(p, { recursive: true }); return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

// ── Player-count polling: AC's HTTP API returns { clients: [...] } ────────────
function startPlayerPolling(id, httpPort) {
  if (!httpPort || playerPollers.has(id)) return
  const poll = async () => {
    try {
      const res = await fetch(`http://localhost:${httpPort}/JSON`)
      if (!res.ok) return
      const data = await res.json()
      const clients = data.clients || []
      win?.webContents.send(`server:players:${id}`, { count: clients.length, clients })
    } catch (e) { /* server may not be up yet — skip this tick */ }
  }
  poll()
  playerPollers.set(id, setInterval(poll, 10000))
}

function stopPlayerPolling(id) {
  const interval = playerPollers.get(id)
  if (interval) { clearInterval(interval); playerPollers.delete(id) }
}

// ── Content Manager Wrapper ───────────────────────────────────────────────────
// Reimplements the wire format of the community-standard "CM wrapper" (as used
// by JustaPenguin/assetto-server-manager and gro-ove's own ac-server-wrapper,
// CM's author) natively in Node rather than bundling either project's binary:
// a small HTTP server that reverse-proxies AC's own /INFO and /JSON endpoints
// unchanged, except for one extra route, /api/details, which CM's server
// browser queries for a richer listing (description, assist rules, password
// checksums, download links). CM finds the wrapper's port by parsing it back
// out of the server name it already gets from the master server list — see
// the 'ℹ' suffix generateServerCfg() appends in iniUtils.js.
const CM_WRAPPER_SEPARATOR = 'ℹ' // ℹ — must match iniUtils.js's generateServerCfg()

function contentManagerPasswordChecksum(serverName, password) {
  // Matches assetto-server-manager's own salt exactly, so CM (which computes
  // the same checksum client-side to show a "password required" indicator
  // without connecting) accepts it.
  return crypto.createHash('sha1').update('apatosaur' + serverName + password).digest('hex')
}

function startCmWrapper(id, config) {
  const { cmWrapper, httpPort, name, password, adminPassword } = config
  if (!cmWrapper?.enabled || !cmWrapper?.port || !httpPort) return
  if (cmWrappers.has(id)) stopCmWrapper(id)

  const wrapperPort = cmWrapper.port
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/details')) {
        const guid = new URL(req.url, 'http://127.0.0.1').searchParams.get('guid') || ''
        const [infoRes, playersRes] = await Promise.all([
          fetch(`http://127.0.0.1:${httpPort}/INFO`),
          fetch(`http://127.0.0.1:${httpPort}/JSON|${guid}`),
        ])
        const info = await infoRes.json()
        const players = await playersRes.json()
        // Strip our own ℹ<port> suffix back out — CM does the same split
        // client-side, but the wrapper's own response should show the clean name.
        info.name = String(info.name || '').split(` ${CM_WRAPPER_SEPARATOR}`)[0]

        const passwordChecksum = ['', '']
        if (password) passwordChecksum[0] = contentManagerPasswordChecksum(name, password)
        if (adminPassword) passwordChecksum[1] = contentManagerPasswordChecksum(name, adminPassword)

        const details = {
          ...info,
          players,
          description: cmWrapper.description || '',
          // Weather/temp/assist detail requires AC's UDP plugin session-info
          // stream, which this app doesn't listen for outside the SHM telemetry
          // path — left as honest zero/empty values rather than fabricated ones.
          ambientTemperature: 0,
          roadTemperature: 0,
          windDirection: 0,
          windSpeed: 0,
          currentWeatherId: '',
          grip: 0,
          gripTransfer: 0,
          assists: {},
          maxContactsPerKm: 0,
          passwordChecksum,
          wrappedPort: httpPort,
          // Per-car/track download links need content metadata this app doesn't
          // track yet (see BuildView's car picker) — left empty rather than guessed.
          content: { cars: {}, track: { url: '' } },
          frequency: 0,
          until: 0,
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(details))
        return
      }

      // Everything else (/INFO, /JSON, /JSON|<guid>) passes straight through.
      const target = await fetch(`http://127.0.0.1:${httpPort}${req.url}`)
      const body = await target.text()
      res.writeHead(target.status, { 'Content-Type': target.headers.get('content-type') || 'application/json' })
      res.end(body)
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end('Content Manager wrapper error: ' + e.message)
    }
  })

  server.on('error', (e) => log(`Content Manager wrapper failed to start for ${id}: ${e.message}`))
  server.listen(wrapperPort, () => log(`Content Manager wrapper started: ${id} on :${wrapperPort} → AC HTTP :${httpPort}`))
  cmWrappers.set(id, { server, port: wrapperPort })
}

function stopCmWrapper(id) {
  const entry = cmWrappers.get(id)
  if (!entry) return
  try { entry.server.close() } catch (e) {}
  cmWrappers.delete(id)
}

// ── UPnP automatic port-forwarding ─────────────────────────────────────────────
// Opportunistic: opens the ports a friend outside the LAN would need to reach
// this server directly, for hosts whose router supports UPnP and whose ISP
// isn't itself NATing them (carrier-grade NAT — common enough that this is
// explicitly detected and reported, not silently assumed away). Tailscale
// remains this app's actual supported join transport regardless of whether
// this succeeds — this is a bonus path for hosts it happens to work for, with
// an honest status the UI can show either way, not a requirement for hosting.
async function startUpnpMapping(id, config) {
  const settings = store.get('settings') || {}
  if (settings.upnpEnabled === false) return
  if (!config.port) return

  const lanIp = allNonInternalIPv4().find((ip) => !isTailscaleIp(ip))
  if (!lanIp) {
    upnpMappings.set(id, { mapped: false, error: 'No LAN IPv4 address found' })
    return
  }

  const ports = [{ port: config.port, protocol: 'TCP' }, { port: config.port, protocol: 'UDP' }]
  if (config.httpPort) ports.push({ port: config.httpPort, protocol: 'TCP' })
  if (config.cmWrapper?.enabled && config.cmWrapper?.port) ports.push({ port: config.cmWrapper.port, protocol: 'TCP' })

  try {
    const gateway = await getGatewayClient({ timeoutMs: 5000 })
    if (!gateway) {
      upnpMappings.set(id, { mapped: false, error: 'No UPnP-capable router found' })
      return
    }

    const mapped = []
    for (const { port, protocol } of ports) {
      await gateway.addPortMapping({ externalPort: port, internalPort: port, internalClient: lanIp, protocol, description: `ShinRacer ${id}` })
      mapped.push({ port, protocol })
    }

    const routerExternalIp = await gateway.getExternalIpAddress()
    let publicIp = null
    try { publicIp = await getPublicIp() } catch (e) { /* offline/unreachable — cgnat check below just can't confirm either way */ }

    const cgnat = isPrivateOrCgnatIp(routerExternalIp) || (publicIp && publicIp !== routerExternalIp)
    upnpMappings.set(id, { mapped: true, routerExternalIp, publicIp, cgnat, ports: mapped, lanIp })
    log(`UPnP: mapped ${mapped.length} port(s) for ${id}, router external IP ${routerExternalIp}${cgnat ? ' (CGNAT detected — likely unreachable from the internet)' : ''}`)
  } catch (e) {
    upnpMappings.set(id, { mapped: false, error: e.message })
    log(`UPnP mapping failed for ${id}: ${e.message}`)
  }
  win?.webContents.send(`server:upnp:${id}`, upnpMappings.get(id))
}

async function stopUpnpMapping(id) {
  const status = upnpMappings.get(id)
  upnpMappings.delete(id)
  if (!status?.mapped || !status.ports?.length) return
  try {
    const gateway = await getGatewayClient({ timeoutMs: 3000 })
    if (!gateway) return
    for (const { port, protocol } of status.ports) {
      try { await gateway.deletePortMapping({ externalPort: port, protocol }) } catch (e) { /* best-effort — router may already be gone */ }
    }
  } catch (e) { /* best-effort cleanup, never blocks server stop */ }
}

// ── IPC: AC Server process management ────────────────────────────────────────
ipcMain.handle('server:launch', async (_, config) => {
  const { id, acServerPath, serverCfgPath, entryListPath } = config

  if (!fs.existsSync(acServerPath)) {
    return { ok: false, error: `acServer.exe not found at: ${acServerPath}` }
  }

  try {
    // acServer.exe is a Go binary using Go's stdlib `flag` package, which only
    // recognizes its own declared short flags (-c/-e) — the previous
    // `--config=`/`--entry_list=` GNU-style long flags aren't defined at all
    // and make every launch fail immediately with "flag provided but not
    // defined: -config" (confirmed against the real acServer.exe's own
    // usage text, and against a real prior failed launch's log file).
    const proc = spawn(acServerPath, [
      '-c', serverCfgPath,
      '-e', entryListPath,
    ], {
      cwd: path.dirname(acServerPath),
      detached: false,
      windowsHide: true
    })

    const logPath = path.join(path.dirname(serverCfgPath), '..', 'logs', `server_${id}.log`)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const logFileStream = fs.createWriteStream(logPath, { flags: 'a' })

    // Capped, short-lived buffer of acServer.exe's own output — only used to
    // build a helpful error message if it dies within the launch grace
    // window below (e.g. "bind: address already in use" from a leftover
    // server still holding the same port); never grows across the server's
    // whole lifetime.
    const recentOutput = []
    const trackOutput = (line) => {
      recentOutput.push(line)
      if (recentOutput.length > 30) recentOutput.shift()
    }

    proc.stdout.on('data', (data) => {
      const line = data.toString()
      trackOutput(line)
      logFileStream.write(`[${new Date().toISOString()}] ${line}`)
      win?.webContents.send(`server:log:${id}`, line.trim())
    })
    proc.stderr.on('data', (data) => {
      const line = data.toString()
      trackOutput(line)
      logFileStream.write(`[ERR][${new Date().toISOString()}] ${line}`)
      win?.webContents.send(`server:log:${id}`, `[ERR] ${line.trim()}`)
    })

    let launchSettled = false
    proc.on('exit', (code) => {
      runningServers.delete(id)
      stopPlayerPolling(id)
      stopCmWrapper(id)
      stopUpnpMapping(id).catch(() => {})
      // Only tell the renderer a *running* server died — a crash inside the
      // launch grace window below is reported back as a launch failure
      // instead, so the renderer never adds a live-server tile for a
      // process that never actually came up in the first place.
      if (launchSettled) win?.webContents.send('server:stopped', { id, code })
      log(`Server exited: ${id} code=${code}`)
      logFileStream.end()
    })

    // acServer.exe fails fast (well under a second) on a bad bind or config
    // — e.g. "bind: Only one usage of each socket address is normally
    // permitted" when a leftover server is still holding the same port.
    // Confirmed live: this is exactly what happened when a stray test
    // server was left running on the default 9600/8081 ports — the new
    // deploy's acServer.exe spawned, immediately failed to bind, and
    // exited, but the old code below returned {ok:true} the instant spawn()
    // was called (regardless of whether the child ever actually stayed up),
    // so a live-server tile was added and then silently removed a moment
    // later via the exit handler above — with no error shown anywhere. That
    // looked exactly like "the new server never shows up." Waiting a short
    // grace window before trusting a launch succeeded turns that into a
    // real, visible error instead.
    const exitedEarly = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 1200)
      proc.once('exit', () => { clearTimeout(timer); resolve(true) })
    })

    if (exitedEarly) {
      const output = recentOutput.join('')
      // Prefer acServer's own clean "listen tcp :PORT: bind: ..." line when
      // present — confirmed live that a port conflict doesn't always log one
      // (it can instead surface as a raw Go panic several stack frames deep
      // in the UDP receive loop), and a multi-line stack trace dumped
      // straight into a toast is a lot less useful than the one line that
      // actually says what went wrong.
      const bindLine = output.split('\n').find(l => l.includes('bind:'))
      const tail = (bindLine || output).trim().slice(-400)
      return {
        ok: false,
        error: tail || 'acServer.exe exited immediately — the game or HTTP port is likely already in use by another running server',
      }
    }

    launchSettled = true
    runningServers.set(id, { process: proc, config, logPath, startedAt: Date.now() })
    startPlayerPolling(id, config.httpPort)
    startCmWrapper(id, config)
    startUpnpMapping(id, config).catch((e) => log(`UPnP mapping error for ${id}: ${e.message}`))
    log(`Server started: ${id} (${config.name || ''}) on port ${config.port}`)
    return { ok: true, pid: proc.pid, logPath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Extracted so the Cluster Fucker's 'server.stop' appFunction (fully
// self-contained main-process state — runningServers never leaves here) can
// call it directly instead of round-tripping through the renderer.
function stopServerProcess(id) {
  const entry = runningServers.get(id)
  if (!entry) return { ok: false, error: 'Server not found' }
  try {
    entry.process.kill('SIGTERM')
    // Windows fallback
    try { execSync(`taskkill /PID ${entry.process.pid} /F`) } catch (e) {}
    runningServers.delete(id)
    stopPlayerPolling(id)
    stopCmWrapper(id)
    stopUpnpMapping(id).catch(() => {})
    log(`Server stopped: ${id}`)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

ipcMain.handle('server:stop', (_, id) => stopServerProcess(id))

ipcMain.handle('server:stopAll', () => {
  // Copy the id list first — stopServerProcess mutates runningServers via
  // .delete(id), and iterating a Map while deleting from it mid-loop is not
  // reliably safe.
  const ids = [...runningServers.keys()]
  const results = ids.map(id => ({ id, ...stopServerProcess(id) }))
  const failed = results.filter(r => !r.ok)
  log(`Stopped all servers: ${ids.length - failed.length}/${ids.length} succeeded`)
  return { ok: failed.length === 0, stopped: results.filter(r => r.ok).map(r => r.id), failed }
})

ipcMain.handle('server:list', () => {
  const list = []
  for (const [id, entry] of runningServers) {
    list.push({ id, pid: entry.process.pid, startedAt: entry.startedAt, config: entry.config, logPath: entry.logPath })
  }
  return list
})

ipcMain.handle('server:readLog', (_, logPath, lines = 200) => {
  try {
    const data = fs.readFileSync(logPath, 'utf8')
    return data.split('\n').slice(-lines).join('\n')
  } catch (e) { return '' }
})

// ── IPC: Traffic config file ops ──────────────────────────────────────────────
ipcMain.handle('traffic:saveConfig', async (_, { trackFolder, iniContent, jsonContent }) => {
  const trafficDir = path.join(trackFolder, 'data', 'traffic')
  const backupDir  = path.join(trafficDir, 'backup')
  const iniPath    = path.join(trafficDir, 'traffic_config.ini')
  const jsonPath   = path.join(trafficDir, 'settings.json')
  const ts         = new Date().toISOString().replace(/[:.]/g, '-')

  try {
    fs.mkdirSync(trafficDir, { recursive: true })
    fs.mkdirSync(backupDir, { recursive: true })

    // Backup existing files
    if (fs.existsSync(iniPath))  fs.copyFileSync(iniPath, path.join(backupDir, `traffic_config_${ts}.ini`))
    if (fs.existsSync(jsonPath)) fs.copyFileSync(jsonPath, path.join(backupDir, `settings_${ts}.json`))

    fs.writeFileSync(iniPath, iniContent, 'utf8')
    fs.writeFileSync(jsonPath, jsonContent, 'utf8')
    return { ok: true, iniPath, jsonPath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('traffic:loadExisting', (_, trackFolder) => {
  const trafficDir = path.join(trackFolder, 'data', 'traffic')
  const iniPath    = path.join(trafficDir, 'traffic_config.ini')
  const jsonPath   = path.join(trafficDir, 'settings.json')
  return {
    hasTrafficDir: fs.existsSync(trafficDir),
    hasIni:        fs.existsSync(iniPath),
    hasJson:       fs.existsSync(jsonPath),
    iniContent:    fs.existsSync(iniPath)  ? fs.readFileSync(iniPath, 'utf8') : null,
    jsonContent:   fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, 'utf8') : null,
  }
})

// ── IPC: Discover AC install ───────────────────────────────────────────────────
ipcMain.handle('ac:detect', () => {
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa',
    'D:\\Steam\\steamapps\\common\\assettocorsa',
    'D:\\SteamLibrary\\steamapps\\common\\assettocorsa',
    'E:\\SteamLibrary\\steamapps\\common\\assettocorsa',
  ]
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'AssettoCorsa.exe'))) {
      log(`AC detected at ${p}`)
      return { found: true, path: p }
    }
  }
  log('AC not auto-detected')
  return { found: false, path: null }
})

// ── IPC: UDP telemetry listener ───────────────────────────────────────────────
// AC broadcasts RT_CAR_INFO packets on the LIVE_TELEMETRY UDP port. RT_LAP (0x22):
// byte 0 = id, bytes 5-8 = lap time ms, 9-12 = sector1 ms, 13-16 = sector2 ms,
// 17-20 = sector3 ms, byte 21 = flags (bit 0 set = invalid lap).
ipcMain.handle('telemetry:start', (_, port = 9996) => {
  return new Promise((resolve) => {
    if (telemetrySocket) { resolve({ ok: true, alreadyRunning: true, port }); return }
    try {
      const sock = dgram.createSocket('udp4')
      sock.on('error', (err) => {
        win?.webContents.send('telemetry:error', err.message)
      })
      sock.on('message', (msg) => {
        if (msg.length < 22 || msg.readUInt8(0) !== 0x22) return
        const flags = msg.readUInt8(21)
        const lap = {
          lapTimeMs: msg.readUInt32LE(5),
          s1: msg.readUInt32LE(9),
          s2: msg.readUInt32LE(13),
          s3: msg.readUInt32LE(17),
          valid: (flags & 1) === 0,
          ts: Date.now(),
        }
        log(`Lap: ${lap.lapTimeMs}ms s1=${lap.s1} s2=${lap.s2} s3=${lap.s3} valid=${lap.valid}`)
        win?.webContents.send('telemetry:lap', lap)
      })
      sock.bind(port, () => {
        telemetrySocket = sock
        resolve({ ok: true, port })
      })
    } catch (e) {
      resolve({ ok: false, error: e.message })
    }
  })
})

ipcMain.handle('telemetry:stop', () => {
  if (telemetrySocket) {
    try { telemetrySocket.close() } catch (e) {}
    telemetrySocket = null
  }
  return { ok: true }
})

// ── IPC: Multi-game telemetry (Phase 13) ──────────────────────────────────────
// Phase 9's original single-file AC1-only implementation (a persistent
// PowerShell reader over .NET's MemoryMappedFiles, base64-framed over
// stdout — see CLAUDE.md's Phase 9 notes for the full reasoning on why that
// approach was chosen over a native addon) has been extracted and extended
// into src/main/telemetry/ — per-game sources (ac1.js unchanged in behavior,
// plus new acc.js/acEvo.js/acRally.js/forza.js), gameDetector.js, and
// normalizer.js mapping every game's raw shape into one canonical frame.
// TelemetryManager (telemetry/index.js) drives auto-detection and dispatch.
//
// startShmTelemetry/stopShmTelemetry keep their Phase 9 names and signatures
// unchanged — the Cluster Fucker's 'telemetry.start'/'telemetry.stop'
// appFunctions and the IPC handlers below both call these directly, and
// preserving the names meant neither call site needed to change.
const { TelemetryManager } = require('./telemetry')
let telemetryManager = null

// Forza World Map (Phase 17): throttles the local player's position POST to
// the backend to once per 500ms, reusing the SAME telemetry frame the LIVE
// tab already receives — no second UDP listener or polling loop needed.
let lastForzaBroadcast = 0

function startShmTelemetry() {
  if (!telemetryManager) {
    telemetryManager = new TelemetryManager({
      onFrame: (frame) => {
        win?.webContents.send('telemetry:frame', frame)
        overlayWindow?.webContents.send('telemetry:frame', frame)
        clusterOverlayWindow?.webContents.send('telemetry:frame', frame)

        if (frame.game === 'fh5' || frame.game === 'fh6') {
          const now = Date.now()
          if (now - lastForzaBroadcast >= 500) {
            lastForzaBroadcast = now
            const backendUrl = store.get('backendUrl')
            const auth = store.get('googleAuth')
            if (backendUrl && auth?.idToken) {
              fetch(`${backendUrl}/api/telemetry/forza-position`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${auth.idToken}`,
                },
                body: JSON.stringify({
                  color: auth.color || '#0066FF',
                  x: frame.worldPosition?.x,
                  z: frame.worldPosition?.z,
                  speed: frame.speed,
                  game: frame.game,
                  isRacing: frame.isRacing,
                  heading: frame.yaw || 0,
                }),
              }).catch(() => {}) // silent fail — no internet/backend down just means the map doesn't update
            }
          }
        }
      },
      onGameDetected: (game) => win?.webContents.send('game:detected', game),
      onGameLost: (game) => win?.webContents.send('game:lost', game),
      onWarning: (message) => win?.webContents.send('telemetry:warning', message),
      log,
    })
  }
  return telemetryManager.start()
}

function stopShmTelemetry() {
  if (telemetryManager) telemetryManager.stop()
  return { ok: true }
}

ipcMain.handle('telemetry:shmStart', async () => startShmTelemetry())
ipcMain.handle('telemetry:shmStop', () => stopShmTelemetry())
ipcMain.handle('telemetry:getActiveGame', () => telemetryManager?.activeGame ?? null)
ipcMain.handle('telemetry:setForzaPort', (_, port) => telemetryManager?.setForzaPort(port) ?? { ok: true })
ipcMain.handle('telemetry:setF125Port', (_, port) => telemetryManager?.setF125Port(port) ?? { ok: true })
ipcMain.handle('telemetry:setAMS2Port', (_, port) => telemetryManager?.setAMS2Port(port) ?? { ok: true })

// Saved overlay x/y (from a corner-snap or a manual drag) can point at a
// monitor that's no longer connected — e.g. the overlay was last positioned
// on a second display that's since been unplugged. A window created at
// those coordinates is technically real (visible: true, no error) but
// invisible to the user, which looks exactly like "the pop-out never
// appeared." Same class of fix already applied to the main window's own
// saved bounds on Phase 3's Track 5 — just never extended to the overlays.
function clampToVisibleDisplay(x, y, width, height) {
  if (typeof x !== 'number' || typeof y !== 'number') return { x: undefined, y: undefined }
  const rect = { x, y, width: width || 1, height: height || 1 }
  const onScreen = screen.getAllDisplays().some(d => {
    const a = d.workArea
    return rect.x < a.x + a.width && rect.x + rect.width > a.x &&
      rect.y < a.y + a.height && rect.y + rect.height > a.y
  })
  return onScreen ? { x, y } : { x: undefined, y: undefined }
}

// ── IPC: Telemetry overlay window ─────────────────────────────────────────────
ipcMain.handle('telemetry:openOverlay', async (_, config = {}) => {
  if (overlayWindow) {
    try {
      overlayWindow.focus()
      return { ok: true, alreadyOpen: true }
    } catch (e) {
      // Stale reference to an already-destroyed window (focus() throws
      // "Object has been destroyed") — clear it and fall through to create
      // a fresh one instead of silently no-op'ing the whole request.
      overlayWindow = null
    }
  }
  try {
    const safePos = clampToVisibleDisplay(config.x, config.y, config.width || 800, config.height || 200)
    overlayWindow = new BrowserWindow({
      width: config.width || 800,
      height: config.height || 200,
      x: safePos.x, y: safePos.y,
      alwaysOnTop: config.alwaysOnTop ?? true,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      resizable: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    if (isDev) {
      overlayWindow.loadURL('http://localhost:5173/#overlay')
    } else {
      overlayWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: 'overlay' })
    }
    overlayWindow.setOpacity(config.opacity ?? 0.85)
    overlayWindow.on('closed', () => {
      overlayWindow = null
      win?.webContents.send('telemetry:overlayClosed')
    })
    log('Telemetry overlay opened')
    return { ok: true }
  } catch (e) {
    overlayWindow = null
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('telemetry:closeOverlay', () => {
  overlayWindow?.close()
  overlayWindow = null
  return { ok: true }
})

ipcMain.handle('telemetry:setOverlayOpacity', (_, opacity) => {
  overlayWindow?.setOpacity(opacity)
  return { ok: true }
})

ipcMain.handle('telemetry:setOverlayAlwaysOnTop', (_, val) => {
  overlayWindow?.setAlwaysOnTop(val)
  return { ok: true }
})

ipcMain.handle('telemetry:setOverlayBounds', (_, bounds) => {
  overlayWindow?.setBounds(bounds)
  return { ok: true }
})

ipcMain.handle('telemetry:overlayStatus', () => ({ open: !!overlayWindow }))

ipcMain.handle('telemetry:showOverlayContextMenu', () => {
  if (!overlayWindow) return { ok: false }
  const template = [
    {
      label: 'Close overlay',
      click: () => { overlayWindow?.close(); overlayWindow = null },
    },
    {
      label: 'Toggle always on top',
      click: () => { overlayWindow?.setAlwaysOnTop(!overlayWindow.isAlwaysOnTop()) },
    },
    { type: 'separator' },
    {
      label: 'Opacity +',
      click: () => { overlayWindow?.setOpacity(Math.min(1, overlayWindow.getOpacity() + 0.05)) },
    },
    {
      label: 'Opacity −',
      click: () => { overlayWindow?.setOpacity(Math.max(0.3, overlayWindow.getOpacity() - 0.05)) },
    },
  ]
  Menu.buildFromTemplate(template).popup({ window: overlayWindow })
  return { ok: true }
})

// ── IPC: The Cluster Fucker ────────────────────────────────────────────────────
ipcMain.handle('cluster:sendKey', async (_, { key }) => {
  try {
    if (robot) {
      const { key: k, modifiers } = parseKeyBinding(key)
      robot.keyTap(k, modifiers)
    } else {
      sendKeyViaSendKeys(key)
    }
    return { ok: true }
  } catch (e) {
    log(`cluster:sendKey failed for "${key}": ${e.message}`)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('cluster:openOverlay', async (_, config) => {
  if (clusterOverlayWindow) {
    try {
      clusterOverlayWindow.focus()
      return { ok: true, alreadyOpen: true }
    } catch (e) {
      // Stale reference to an already-destroyed window — clear it and fall
      // through to create a fresh one instead of silently no-op'ing.
      clusterOverlayWindow = null
    }
  }
  try {
    const cw = config.layout.canvasWidth + 16, ch = config.layout.canvasHeight + 16
    // Default to the center of whichever display the main window is
    // currently on, not a fixed (100,100) — a corner spawn is easy to miss
    // entirely (especially with a transparent canvas — see the
    // 'transparent' default backgroundColor note in ClusterView.jsx) and
    // has no relation to where the user is actually looking.
    const anchorDisplay = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()
    const centeredX = anchorDisplay.workArea.x + Math.round((anchorDisplay.workArea.width - cw) / 2)
    const centeredY = anchorDisplay.workArea.y + Math.round((anchorDisplay.workArea.height - ch) / 2)
    const safePos = clampToVisibleDisplay(config.x ?? centeredX, config.y ?? centeredY, cw, ch)
    clusterOverlayWindow = new BrowserWindow({
      width: cw,
      height: ch,
      x: safePos.x ?? centeredX,
      y: safePos.y ?? centeredY,
      alwaysOnTop: config.alwaysOnTop ?? true,
      transparent: true,
      frame: false,
      skipTaskbar: false,
      resizable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    if (isDev) {
      clusterOverlayWindow.loadURL('http://localhost:5173/#cluster-overlay')
    } else {
      clusterOverlayWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: 'cluster-overlay' })
    }
    clusterOverlayWindow.setOpacity(config.opacity ?? 1.0)
    // 'floating' (Electron's default alwaysOnTop level) reliably beats
    // ordinary windows but not a game running in exclusive fullscreen —
    // the exact scenario this overlay exists for. 'screen-saver' is the
    // standard fix (same trick OBS/Discord overlays use) for actually
    // staying on top of a fullscreen DirectX/OpenGL surface. show() +
    // focus() + moveTop() are belt-and-braces: a window created with
    // show:false and raised from a background IPC call (e.g. triggered by
    // a physical button-box keystroke while AC has focus, not by clicking
    // inside this app) doesn't always get an implicit stacking boost on
    // Windows the way a user-clicked show:true window does.
    clusterOverlayWindow.setAlwaysOnTop(config.alwaysOnTop ?? true, 'screen-saver')
    clusterOverlayWindow.show()
    clusterOverlayWindow.focus()
    clusterOverlayWindow.moveTop()
    // The overlay window loads a fresh renderer instance with no props to pass
    // it directly — electron-store is how it recovers which layout to render.
    store.set('activeClusterOverlay', config.layout)
    clusterOverlayWindow.on('closed', () => {
      clusterOverlayWindow = null
      win?.webContents.send('cluster:overlayClosed')
    })
    log('Cluster overlay opened')
    return { ok: true }
  } catch (e) {
    clusterOverlayWindow = null
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('cluster:closeOverlay', () => {
  clusterOverlayWindow?.close()
  clusterOverlayWindow = null
  return { ok: true }
})

ipcMain.handle('cluster:overlayStatus', () => ({ open: !!clusterOverlayWindow }))

ipcMain.handle('cluster:showOverlayContextMenu', () => {
  if (!clusterOverlayWindow) return { ok: false }
  const template = [
    { label: 'Close overlay', click: () => { clusterOverlayWindow?.close(); clusterOverlayWindow = null } },
    { label: 'Toggle always on top', click: () => { clusterOverlayWindow?.setAlwaysOnTop(!clusterOverlayWindow.isAlwaysOnTop(), 'screen-saver') } },
  ]
  Menu.buildFromTemplate(template).popup({ window: clusterOverlayWindow })
  return { ok: true }
})

// Functions with all the state they need already in this process (server
// tracking, the SHM reader) are handled directly; everything else needs
// renderer-side app state (settings/profiles/WebRTC mic state/current view)
// that only exists in the renderer, so it's forwarded as a single 'cluster:invoke'
// event for App.jsx (and whichever view is mounted) to act on.
ipcMain.handle('cluster:callFn', async (_, { fn, param }) => {
  switch (fn) {
    case 'telemetry.start': return startShmTelemetry()
    case 'telemetry.stop':  return stopShmTelemetry()
    case 'server.stop':     return stopServerProcess(param?.id)
    default:
      win?.webContents.send('cluster:invoke', { fn, param })
      return { ok: true, forwarded: true }
  }
})

// ── IPC: Launch Assetto Corsa directly (no replay) ────────────────────────────
ipcMain.handle('ac:launch', () => {
  const settings = store.get('settings') || {}
  if (!settings.acPath) return { ok: false, error: 'AC path not set' }
  const exePath = path.join(settings.acPath, 'AssettoCorsa.exe')
  if (!fs.existsSync(exePath)) return { ok: false, error: 'AssettoCorsa.exe not found — check AC path in Settings' }
  try {
    spawn(exePath, [], { detached: true, cwd: settings.acPath, windowsHide: false })
    log('Launched Assetto Corsa')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── IPC: Local network ────────────────────────────────────────────────────────
// Tailscale hands out addresses from a fixed CIDR block (100.64.0.0/10, the
// carrier-grade-NAT range reserved for exactly this kind of shared-address-
// space use) — checking against that range, not an interface name string,
// works the same on every OS.
function isTailscaleIp(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127
}

function allNonInternalIPv4() {
  const out = []
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

// Previously just "first non-internal IPv4 found," which — on a machine
// running Tailscale alongside a real LAN adapter — depended entirely on
// os.networkInterfaces()'s arbitrary enumeration order to pick the right one.
// Since Tailscale is this app's actual join transport (see CLAUDE.md), the
// invite Share modal needs the Tailscale address specifically and
// deterministically, not whichever adapter happened to enumerate first.
ipcMain.handle('network:localIp', () => {
  const ips = allNonInternalIPv4()
  return ips.find(isTailscaleIp) || ips[0] || null
})

// The real LAN-side IP (explicitly NOT Tailscale's) — this is the address
// UPnP needs to map ports *to*, since a router's UPnP maps its WAN side to a
// device on its own physical LAN; Tailscale's virtual interface isn't
// reachable that way at all.
ipcMain.handle('network:lanIp', () => {
  const ips = allNonInternalIPv4()
  return ips.find(ip => !isTailscaleIp(ip)) || null
})

// Real internet-facing public IP, per an external lookup — used to detect
// carrier-grade NAT (compared against whatever IP UPnP's router reports as
// "external": if they differ, the router's own WAN address is itself
// private, meaning there's another NAT layer upstream that UPnP can't reach
// or configure, and direct-internet joining won't work regardless of any
// port mapping done locally.
async function getPublicIp() {
  const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`ipify returned ${res.status}`)
  const data = await res.json()
  return data.ip
}

function isPrivateOrCgnatIp(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true // CGNAT/Tailscale range
  return false
}

ipcMain.handle('network:publicIp', async () => {
  try {
    const ip = await getPublicIp()
    return { ok: true, ip }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('network:upnpStatus', (_, id) => upnpMappings.get(id) || null)

// Discovery + external-IP check only, no actual port mapping — lets Settings
// give an honest "will this even work" answer before a host ever deploys a
// server, rather than only finding out mid-hosting.
ipcMain.handle('network:upnpTest', async () => {
  try {
    const gateway = await getGatewayClient({ timeoutMs: 5000 })
    if (!gateway) return { ok: true, supported: false }
    const routerExternalIp = await gateway.getExternalIpAddress()
    let publicIp = null
    try { publicIp = await getPublicIp() } catch (e) { /* offline — cgnat just can't be confirmed either way */ }
    const cgnat = isPrivateOrCgnatIp(routerExternalIp) || (publicIp && publicIp !== routerExternalIp)
    return { ok: true, supported: true, routerExternalIp, publicIp, cgnat }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── IPC: Machine hostname (Phase 12 host registration) ───────────────────────
ipcMain.handle('system:hostname', () => os.hostname())

// ── IPC: AI Race Engineer ─────────────────────────────────────────────────────
// Optional, off-by-default feature — the driver brings their own Claude/OpenAI
// key or points at a local OpenAI-compatible server (Ollama/LM Studio). Calls
// go straight from this main process to the chosen provider; never relayed
// through backend/ (the Pi-hosted service) and never touches imq2/Q2.
const { chatCompletion } = require('./ai/providers')
ipcMain.handle('ai:chat', (_, req) => chatCompletion(req))

// Voice — push-to-talk only, no wake word. See ai/deepgram.js's header comment.
const { transcribe, synthesize } = require('./ai/deepgram')
ipcMain.handle('ai:transcribe', (_, req) => transcribe(req))
ipcMain.handle('ai:speak', (_, req) => synthesize(req))

// ── IPC: Port availability (Host Status readiness checklist) ────────────────
ipcMain.handle('net:checkPortAvailable', (_, port) => new Promise((resolve) => {
  const tester = net.createServer()
  tester.once('error', () => resolve(false))
  tester.once('listening', () => tester.close(() => resolve(true)))
  tester.listen(port, '127.0.0.1')
}))

// ── IPC: Event reminders ───────────────────────────────────────────────────────
// `events` is a pre-filtered list of { id, name, time, date, track } candidates —
// the renderer owns fetching/filtering since event data lives on the backend, not locally.
ipcMain.handle('reminders:check', (_, events = []) => {
  for (const evt of events) {
    if (notifiedEventIds.has(evt.id)) continue
    notifiedEventIds.add(evt.id)
    if (Notification.isSupported()) {
      new Notification({ title: 'AC Event soon', body: `${evt.name} — ${evt.time}` }).show()
    }
  }
  return { ok: true }
})

// ── IPC: Logs ─────────────────────────────────────────────────────────────────
ipcMain.handle('logs:openFolder', () => { shell.openPath(LOG_DIR); return { ok: true } })

// ── IPC: Replay browser ────────────────────────────────────────────────────────
function replayDirPath() {
  return path.join(app.getPath('documents'), 'Assetto Corsa', 'replay')
}

ipcMain.handle('replays:scan', async () => {
  const replayDir = replayDirPath()
  try {
    if (!fs.existsSync(replayDir)) return { ok: true, found: false, replayDir, replays: [] }
    const replays = fs.readdirSync(replayDir)
      .filter(f => f.toLowerCase().endsWith('.acreplay'))
      .map(filename => {
        const full = path.join(replayDir, filename)
        const stat = fs.statSync(full)
        return { filename, path: full, size: stat.size, mtime: stat.mtime.toISOString() }
      })
    return { ok: true, found: true, replayDir, replays }
  } catch (e) {
    return { ok: false, found: false, replayDir, replays: [], error: e.message }
  }
})

// .acreplay binary header (community-documented): uint32 version, uint32 car
// count, then length-prefixed UTF-8 strings for track/trackConfig, then a
// uint32 car-entry count followed by (model, driver, skin) string triples per car.
function readLPString(buf, offset) {
  const len = buf.readUInt32LE(offset)
  const str = buf.toString('utf8', offset + 4, offset + 4 + len)
  return { str, next: offset + 4 + len }
}

function parseReplayHeader(buf) {
  let offset = 0
  const version = buf.readUInt32LE(offset); offset += 4
  offset += 4 // recorded-car count field — superseded by the per-car loop count below
  let r = readLPString(buf, offset)
  const track = r.str; offset = r.next
  r = readLPString(buf, offset)
  const trackConfig = r.str; offset = r.next
  const numCars = buf.readUInt32LE(offset); offset += 4
  const cars = []
  for (let i = 0; i < numCars; i++) {
    r = readLPString(buf, offset); const model = r.str; offset = r.next
    r = readLPString(buf, offset); const driver = r.str; offset = r.next
    r = readLPString(buf, offset); const skin = r.str; offset = r.next
    cars.push({ model, driver, skin })
  }
  return { version, track, trackConfig, cars }
}

ipcMain.handle('replays:getMetadata', async (_, filePath) => {
  try {
    const stat = fs.statSync(filePath)
    const cache = store.get('replayMetadata') || {}
    const cached = cache[filePath]
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached

    const buf = fs.readFileSync(filePath)
    const header = parseReplayHeader(buf)
    const metadata = {
      parsed: true, ...header,
      recordedAt: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs, cachedAt: Date.now(),
    }
    cache[filePath] = metadata
    store.set('replayMetadata', cache)
    return metadata
  } catch (e) {
    log(`Replay metadata parse failed for ${filePath}: ${e.message}`)
    return { parsed: false }
  }
})

ipcMain.handle('replays:launch', async (_, replayPath) => {
  const acPath = store.get('settings')?.acPath || ''
  if (!acPath) return { ok: false, error: 'AC path not set' }
  const exePath = path.join(acPath, 'AssettoCorsa.exe')
  if (!fs.existsSync(exePath)) return { ok: false, error: 'AC path not set' }
  try {
    spawn(exePath, ['-replay', replayPath], { detached: true, cwd: acPath, windowsHide: false })
    log(`Launched replay: ${replayPath}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('replays:openFolder', () => {
  const replayDir = replayDirPath()
  fs.mkdirSync(replayDir, { recursive: true })
  shell.openPath(replayDir)
  return { ok: true }
})

// ── IPC: Mod Manager — download + install ─────────────────────────────────────
const CATEGORY_CONTENT_DIR = { cars: 'cars', tracks: 'tracks', tools: 'tools' }

ipcMain.handle('mods:download', async (_, { fileId, filename, category }) => {
  const settings = store.get('settings') || {}
  const backendUrl = store.get('backendUrl')
  if (!settings.acPath) return { ok: false, error: 'AC path not set — set it in Settings first' }
  if (!backendUrl) return { ok: false, error: 'Backend URL not set' }

  const subdir = CATEGORY_CONTENT_DIR[category]
  if (!subdir) return { ok: false, error: `Unknown category: ${category}` }

  const tempZip = path.join(app.getPath('temp'), `mod_${Date.now()}_${filename}`)
  const destName = filename.replace(/\.zip$/i, '')
  const destPath = path.join(settings.acPath, 'content', subdir, destName)

  try {
    const res = await fetch(`${backendUrl}/api/mods/download/${fileId}`)
    if (!res.ok) return { ok: false, error: `Download failed: HTTP ${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(tempZip, buf)

    fs.mkdirSync(destPath, { recursive: true })
    // -EncodedCommand (Base64 UTF-16LE) sidesteps quoting/escaping entirely for
    // paths that may contain spaces or apostrophes — safer than building a
    // -Command string by concatenation. ProgressPreference silences Expand-Archive's
    // CLIXML progress-stream noise, which otherwise leaks onto stderr.
    const psQuote = (s) => s.replace(/'/g, "''")
    const script = `$ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${psQuote(tempZip)}' -DestinationPath '${psQuote(destPath)}' -Force`
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
    fs.unlinkSync(tempZip)
    log(`Mod installed: ${filename} -> ${destPath}`)
    return { ok: true, installedPath: destPath }
  } catch (e) {
    try { fs.unlinkSync(tempZip) } catch (_e) {}
    log(`Mod install failed (${filename}): ${e.message}`)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('mods:openFolder', (_, category) => {
  const settings = store.get('settings') || {}
  const subdir = CATEGORY_CONTENT_DIR[category]
  const folder = subdir ? path.join(settings.acPath, 'content', subdir) : settings.acPath
  shell.openPath(folder)
  return { ok: true }
})

ipcMain.handle('ac:scanTracks', (_, acPath) => {
  const tracksDir = path.join(acPath, 'content', 'tracks')
  try {
    const tracks = fs.readdirSync(tracksDir).filter(name => {
      return fs.statSync(path.join(tracksDir, name)).isDirectory()
    }).map(name => {
      const trafficDir = path.join(tracksDir, name, 'data', 'traffic')
      const hasTraffic = fs.existsSync(trafficDir)
      // Real AC convention (verified against real installed tracks, both
      // single- and multi-layout — the previous `<track>/layouts/` check
      // matched exactly zero of 78 real tracks in this content library and
      // silently fell back to a fabricated `['default']` for every one of
      // them): a multi-layout track has one `ui/<layout>/ui_track.json` per
      // layout, with that layout's actual content in a same-named sibling
      // folder at the track root (e.g. `ddm_fujimi_kaido/A/{ai,data,map.png}`).
      // A single-layout track has `ui_track.json` directly in `ui/`, with no
      // layout subfolder at all — CONFIG_TRACK should be left blank for
      // those, not set to a nonexistent "default" folder, which is exactly
      // what made Content Manager report an installed track as missing.
      const uiDir = path.join(tracksDir, name, 'ui')
      let layouts = ['']
      if (fs.existsSync(uiDir)) {
        const layoutDirs = fs.readdirSync(uiDir, { withFileTypes: true })
          .filter(e => e.isDirectory()).map(e => e.name)
        if (layoutDirs.length > 0) layouts = layoutDirs
      }
      return { name, hasTraffic, layouts, path: path.join(tracksDir, name) }
    })
    return { ok: true, tracks }
  } catch (e) {
    return { ok: false, error: e.message, tracks: [] }
  }
})

// ── IPC: FPV Drone Assistant (Phase 14) ───────────────────────────────────────
// sug44/FpvDroneForAC — a CSP Lua app that turns any car into a flyable FPV
// drone. Everything here is plain fs/exec against the mod's own on-disk
// files under {acPath}\apps\lua\FpvDrone\ — no mod files are ever written to
// except its settings/presets/*.json, and never FpvDrone.lua itself.
const FPV_DIR = (acPath) => path.join(acPath, 'apps', 'lua', 'FpvDrone')
const FPV_PRESETS_DIR = (acPath) => path.join(FPV_DIR(acPath), 'settings', 'presets')

ipcMain.handle('fpv:checkInstall', async () => {
  const settings = store.get('settings') || {}
  const acPath = settings.acPath || ''

  const cspVersionPath = path.join(acPath, 'extension', 'version')
  let cspVersion = null
  let cspCompatible = false
  try {
    cspVersion = fs.readFileSync(cspVersionPath, 'utf8').trim()
    // Real CSP version strings look like "0.1.79" or "0.1.80-preview115" — the
    // "115" is a separate preview-build counter appended after a hyphen, NOT
    // a fourth dotted version component. A naive /(\d+)\.(\d+)\.(\d+)/ match
    // against "0.1.80-preview116" only ever captures "0.1.80" (patch=80),
    // silently dropping the preview number entirely — verified this actually
    // breaks (patch stuck at 80 regardless of the preview number) with a
    // standalone test before writing the fix below, not assumed.
    const dotted = cspVersion.match(/(\d+)\.(\d+)\.(\d+)/)
    if (dotted) {
      const [, , , patch] = dotted.map(Number)
      if (patch < 80) cspCompatible = true // 0.1.79 and earlier
      else if (patch > 80) cspCompatible = false // 0.1.81+
      else {
        // patch === 80: only the preview builds up to preview115 are safe.
        // A bare "0.1.80" with no preview suffix at all is treated as
        // incompatible rather than assumed safe — conservative on purpose,
        // since the whole point of this check is steering people away from
        // the jitter-causing versions.
        const preview = cspVersion.match(/preview[- ]?(\d+)/i)
        cspCompatible = !!preview && Number(preview[1]) <= 115
      }
    }
  } catch (e) { /* CSP not installed, or version file unreadable — cspVersion stays null */ }

  // "AC running" reuses the exact same process-list check the multi-game
  // telemetry detector already uses (EXE_NAMES.ac1) rather than a second,
  // separate implementation — see gameDetector.js.
  const { getRunningProcessNames, EXE_NAMES } = require('./telemetry/gameDetector')
  const acRunning = getRunningProcessNames().has(EXE_NAMES.ac1.toLowerCase())

  return {
    acPath,
    cspFound: fs.existsSync(path.join(acPath, 'extension', 'ext_config.ini')),
    cspVersion,
    cspCompatible,
    modInstalled: fs.existsSync(path.join(FPV_DIR(acPath), 'FpvDrone.lua')),
    acRunning,
  }
})

ipcMain.handle('fpv:readPresets', () => {
  const settings = store.get('settings') || {}
  const presetsPath = FPV_PRESETS_DIR(settings.acPath || '')
  try {
    const files = fs.readdirSync(presetsPath).filter(f => f.endsWith('.json'))
    return { ok: true, presets: files.map(f => f.replace(/\.json$/, '')) }
  } catch (e) { return { ok: false, error: e.message, presets: [] } }
})

ipcMain.handle('fpv:readPreset', (_, name) => {
  const settings = store.get('settings') || {}
  const filePath = path.join(FPV_PRESETS_DIR(settings.acPath || ''), `${name}.json`)
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return { ok: true, data }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('fpv:writePreset', (_, { name, data }) => {
  const settings = store.get('settings') || {}
  const presetsDir = FPV_PRESETS_DIR(settings.acPath || '')
  const filePath = path.join(presetsDir, `${name}.json`)
  try {
    fs.mkdirSync(presetsDir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

// Not in the original spec's IPC list, but the Settings tab's "Delete
// preset" button (explicitly required) has nothing to call without it —
// there's no generic fs:deleteFile bridge exposed anywhere else in this
// app to reuse.
ipcMain.handle('fpv:deletePreset', (_, name) => {
  const settings = store.get('settings') || {}
  const filePath = path.join(FPV_PRESETS_DIR(settings.acPath || ''), `${name}.json`)
  try {
    fs.unlinkSync(filePath)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('fpv:readMapImage', (_, trackName) => {
  const settings = store.get('settings') || {}
  const mapPath = path.join(settings.acPath || '', 'content', 'tracks', trackName, 'map.png')
  try {
    const buf = fs.readFileSync(mapPath)
    return { ok: true, base64: buf.toString('base64') }
  } catch (e) { return { ok: false } }
})

// ── IPC: run an arbitrary shell command (joy.cpl launcher today) ─────────────
// Trusted-user local app, no untrusted input reaches this — no shell
// injection hardening attempted, per explicit spec.
ipcMain.handle('shell:runCommand', (_, cmd) => {
  exec(cmd)
  return { ok: true }
})

// ── IPC: Forza World Map (Phase 17) ───────────────────────────────────────────
// Real game map images are copyrighted, so this repo only ships hand-drawn
// placeholder SVGs (resources/maps/{game}_map.svg) — a real .jpg/.png the
// user supplies (or copies in via "Replace map image") always wins over it.
const MAPS_DIR = path.join(__dirname, '../../resources/maps')

ipcMain.handle('forzamap:getMapImage', (_, game) => {
  const base = game === 'fh6' ? 'fh6_map' : 'fh5_map'
  for (const [ext, mimeType] of [['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.svg', 'image/svg+xml']]) {
    const file = path.join(MAPS_DIR, base + ext)
    try {
      const buf = fs.readFileSync(file)
      return { ok: true, base64: buf.toString('base64'), mimeType, isPlaceholder: ext === '.svg' }
    } catch (e) { /* try the next extension */ }
  }
  return { ok: false }
})

ipcMain.handle('forzamap:replaceMapImage', async (_, game) => {
  const result = await dialog.showOpenDialog(win, {
    title: `Select a ${game === 'fh6' ? 'FH6' : 'FH5'} map image`,
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
  const src = result.filePaths[0]
  const ext = path.extname(src).toLowerCase() === '.png' ? '.png' : '.jpg'
  const dest = path.join(MAPS_DIR, (game === 'fh6' ? 'fh6_map' : 'fh5_map') + ext)
  try {
    fs.mkdirSync(MAPS_DIR, { recursive: true })
    fs.copyFileSync(src, dest)
    log(`Forza map replaced: ${game} -> ${dest}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── IPC: Car Stereo — YouTube Music embedded BrowserView (Phase 18) ─────────
// YTM has no public playback API — Google shut the unofficial ones down — so
// this is an embedded music.youtube.com panel controlled by CSS-selector
// injection. Selectors WILL break on site updates; every executeJavaScript
// call below is wrapped so a broken selector degrades to { ok:false } instead
// of throwing into the caller. `partition: 'persist:ytm'` keeps the signed-in
// session across app restarts without touching the main window's own cookies.
ipcMain.handle('ytm:show', (_, bounds) => {
  if (!win) return { ok: false }
  if (!ytmView) {
    ytmView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:ytm' },
    })
    ytmView.webContents.loadURL('https://music.youtube.com')
  }
  win.addBrowserView(ytmView)
  if (bounds) ytmView.setBounds(bounds)
  return { ok: true }
})

ipcMain.handle('ytm:hide', () => {
  if (ytmView && win) win.removeBrowserView(ytmView)
  return { ok: true }
})

ipcMain.handle('ytm:getNowPlaying', async () => {
  if (!ytmView) return { ok: false }
  try {
    const result = await ytmView.webContents.executeJavaScript(`
      (() => {
        try {
          const ms = navigator.mediaSession
          if (!ms?.metadata) return null
          return {
            title: ms.metadata.title,
            artist: ms.metadata.artist,
            album: ms.metadata.album,
            artwork: ms.metadata.artwork?.[0]?.src || null,
            playing: ms.playbackState === 'playing',
          }
        } catch (e) { return null }
      })()
    `)
    return { ok: true, data: result }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('ytm:play', async () => {
  try {
    await ytmView?.webContents.executeJavaScript(`
      (() => {
        try {
          const btn = document.querySelector('tp-yt-paper-icon-button#play-pause-button') ||
                      document.querySelector('.play-pause-button')
          btn?.click()
        } catch (e) {}
      })()
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('ytm:next', async () => {
  try {
    await ytmView?.webContents.executeJavaScript(`
      (() => { try { document.querySelector('.next-button, [aria-label="Next"]')?.click() } catch (e) {} })()
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('ytm:prev', async () => {
  try {
    await ytmView?.webContents.executeJavaScript(`
      (() => { try { document.querySelector('.previous-button, [aria-label="Previous"]')?.click() } catch (e) {} })()
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

// ── IPC: Car Stereo — Apple Music embedded BrowserView (Phase 18) ───────────
// Same embedded-panel approach as YTM, for the same reason (no public
// playback API without a $99/yr Apple Developer MusicKit token — see
// SettingsView's Apple Music section for the optional native-controls path).
ipcMain.handle('apple:show', (_, bounds) => {
  if (!win) return { ok: false }
  if (!appleView) {
    appleView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:apple' },
    })
    appleView.webContents.loadURL('https://music.apple.com')
  }
  win.addBrowserView(appleView)
  if (bounds) appleView.setBounds(bounds)
  return { ok: true }
})

ipcMain.handle('apple:hide', () => {
  if (appleView && win) win.removeBrowserView(appleView)
  return { ok: true }
})

ipcMain.handle('apple:getNowPlaying', async () => {
  if (!appleView) return { ok: false }
  try {
    const result = await appleView.webContents.executeJavaScript(`
      (() => {
        try {
          const ms = navigator.mediaSession
          if (!ms?.metadata) return null
          return {
            title: ms.metadata.title,
            artist: ms.metadata.artist,
            album: ms.metadata.album,
            artwork: ms.metadata.artwork?.[0]?.src || null,
            playing: ms.playbackState === 'playing',
          }
        } catch (e) { return null }
      })()
    `)
    return { ok: true, data: result }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('apple:play', async () => {
  try {
    await appleView?.webContents.executeJavaScript(`
      (() => {
        try {
          const btn = document.querySelector('[data-testid="play-pause-btn"], .playback-controls__playback-btn.playback-controls__playback-btn--play')
          if (btn) { btn.click(); return }
          const ms = navigator.mediaSession
          if (ms?.playbackState === 'playing') ms.setActionHandler && ms.pause?.()
          else ms?.play?.()
        } catch (e) {}
      })()
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('apple:next', async () => {
  try {
    await appleView?.webContents.executeJavaScript(`
      (() => { try { document.querySelector('[data-testid="next-btn"]')?.click() } catch (e) {} })()
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('apple:prev', async () => {
  try {
    await appleView?.webContents.executeJavaScript(`
      (() => { try { document.querySelector('[data-testid="previous-btn"]')?.click() } catch (e) {} })()
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

// ── IPC: Car Stereo — local file library (Phase 18) ──────────────────────────
const LOCAL_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac']

ipcMain.handle('local:scanFolder', async (_, folderPath) => {
  const results = []
  function scan(dir) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) scan(full)
      else if (LOCAL_AUDIO_EXTS.includes(path.extname(e.name).toLowerCase())) {
        results.push({ path: full, filename: e.name, dir: path.relative(folderPath, dir) })
      }
    }
  }
  try {
    if (!fs.existsSync(folderPath)) return { ok: false, error: 'Folder not found' }
    scan(folderPath)
    return { ok: true, files: results }
  } catch (e) { return { ok: false, error: e.message } }
})

// music-metadata publishes ESM as its default entry, which raises the
// question of whether a plain require() from this CommonJS file would throw
// ERR_REQUIRE_ESM — checked against the actual installed package
// (node_modules/music-metadata/package.json) before writing this rather than
// assumed: it ships a dual package via package.json `exports` conditions
// (a `require: "./lib/node.cjs"` condition alongside `import`), so a normal
// require() resolves to the real CJS build and works correctly, same as
// every other require() in this file.
ipcMain.handle('local:getMetadata', async (_, filePath) => {
  try {
    const mm = require('music-metadata')
    const meta = await mm.parseFile(filePath, { duration: true })
    return {
      ok: true,
      data: {
        title: meta.common.title || path.basename(filePath),
        artist: meta.common.artist || 'Unknown',
        album: meta.common.album || 'Unknown',
        duration: meta.format.duration || 0,
        picture: meta.common.picture?.[0]
          ? `data:${meta.common.picture[0].format};base64,${meta.common.picture[0].data.toString('base64')}`
          : null,
      },
    }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('local:getFileUrl', (_, filePath) => {
  return { ok: true, url: `file://${filePath.replace(/\\/g, '/')}` }
})

// ── IPC: Car Stereo — game audio volume via nircmd.exe (Phase 18) ───────────
// nircmd isn't bundled (freeware, redistribution terms are unclear) — the
// user downloads it once per docs/CAR_STEREO_SETUP.md. execFileSync with an
// argv array (not a shell string) avoids quoting/injection concerns entirely,
// same reasoning as every other execFileSync call in this file.
const NIRCMD_PATH = path.join(__dirname, '../../resources/tools/nircmd.exe')

ipcMain.handle('audio:setAppVolume', (_, { processName, volume }) => {
  if (!fs.existsSync(NIRCMD_PATH)) return { ok: false, error: 'nircmd.exe not found in resources/tools/ — see docs/CAR_STEREO_SETUP.md' }
  try {
    const level = Math.max(0, Math.min(1, volume / 100))
    execFileSync(NIRCMD_PATH, ['setappvolume', processName, String(level)])
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('audio:getActiveGame', () => telemetryManager?.activeGame ?? null)
ipcMain.handle('audio:nircmdStatus', () => ({ found: fs.existsSync(NIRCMD_PATH) }))

// ── IPC: Car Stereo — mirror now-playing/mixer state to the Cluster Fucker's
// pop-out overlay window (Phase 18). Same relay shape as the telemetry frame
// forwarding above: the overlay is a separate BrowserWindow/renderer with no
// access to the main window's Spotify SDK / BrowserViews / Web Audio graph,
// so useStereo (main window) pushes a lightweight state snapshot here and
// main.js forwards it on; actions taken in the overlay round-trip back
// through the existing cluster:callFn -> cluster:invoke -> window
// CustomEvent('cluster:stereo.*') path already used for ptt/mute/volume.
ipcMain.handle('stereo:pushState', (_, state) => {
  clusterOverlayWindow?.webContents.send('stereo:state', state)
  return { ok: true }
})
