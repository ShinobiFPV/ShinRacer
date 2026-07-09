const { app, BrowserWindow, ipcMain, dialog, shell, Notification, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const dgram = require('dgram')
const net = require('net')
const { spawn, execSync, execFileSync } = require('child_process')
const Store = require('electron-store')
const { autoUpdater } = require('electron-updater')

const isDev = process.argv.includes('--dev')
const store = new Store()

// ── Running server processes (pid → { process, config }) ─────────────────────
const runningServers = new Map()

// ── Per-server player-count pollers (id → intervalId) ─────────────────────────
const playerPollers = new Map()

// ── UDP telemetry socket ──────────────────────────────────────────────────────
let telemetrySocket = null

// ── Telemetry overlay window ──────────────────────────────────────────────────
let overlayWindow = null

// ── Cluster Fucker overlay window ─────────────────────────────────────────────
let clusterOverlayWindow = null

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

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(app.getPath('appData'), 'ShinRacer', 'logs')
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
    backgroundColor: '#050507',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050507',
      symbolColor: '#5A70A0',
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
  })
}

// ── Auto-updater ──────────────────────────────────────────────────────────────
autoUpdater.on('update-available', () => {
  log('Update available — downloading in background')
  if (Notification.isSupported()) {
    new Notification({ title: 'ShinRacer', body: 'ShinRacer update available — downloading in background' }).show()
  }
})

autoUpdater.on('update-downloaded', async (info) => {
  log(`Update downloaded: ${info.version}`)
  const result = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Update ready',
    message: `ShinRacer ${info.version} has been downloaded.`,
    buttons: ['Restart and update', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) autoUpdater.quitAndInstall()
})

autoUpdater.on('error', (err) => { log(`Auto-updater error: ${err.message}`) })

// ── accomp:// protocol (invite links + direct "Connect in AC" round-trips) ────
// Windows launches a fresh process for a protocol click; if we're already
// running, that second process's argv arrives here via 'second-instance'
// instead — requestSingleInstanceLock() is what makes that handoff happen.
// A subset of accomp:// URLs are Google OAuth callbacks (accomp://oauth?code=...)
// rather than invite/connect links — those get routed to their own IPC event
// carrying just the extracted code, so ModsView doesn't have to re-parse the
// generic accomp:open payload that DeployView already owns interpreting.
function handleAccompUrl(url) {
  log(`accomp:// URL received: ${url}`)
  const isOauth = /^accomp:\/\/oauth\b/i.test(url) || url.includes('?code=')
  if (isOauth) {
    const match = url.match(/[?&]code=([^&]+)/)
    if (match) {
      win?.webContents.send('oauth:callback', decodeURIComponent(match[1]))
      return
    }
  }
  // Cluster Fucker QR/share deep link: accomp://cluster/{presetId} — the
  // renderer owns opening ClusterView and fetching the preset from the
  // backend, same division of labor as the OAuth branch above.
  const clusterMatch = url.match(/^accomp:\/\/cluster\/([^/?]+)/i)
  if (clusterMatch) {
    win?.webContents.send('cluster:loadPreset', { presetId: clusterMatch[1] })
    return
  }
  win?.webContents.send('accomp:open', url)
}

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
    if (!isDev) autoUpdater.checkForUpdatesAndNotify()
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

// ── IPC: AC Server process management ────────────────────────────────────────
ipcMain.handle('server:launch', async (_, config) => {
  const { id, acServerPath, serverCfgPath, entryListPath } = config

  if (!fs.existsSync(acServerPath)) {
    return { ok: false, error: `acServer.exe not found at: ${acServerPath}` }
  }

  try {
    const proc = spawn(acServerPath, [
      `--config=${serverCfgPath}`,
      `--entry_list=${entryListPath}`
    ], {
      cwd: path.dirname(acServerPath),
      detached: false,
      windowsHide: true
    })

    const logPath = path.join(path.dirname(serverCfgPath), '..', 'logs', `server_${id}.log`)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const logFileStream = fs.createWriteStream(logPath, { flags: 'a' })

    proc.stdout.on('data', (data) => {
      const line = data.toString()
      logFileStream.write(`[${new Date().toISOString()}] ${line}`)
      win?.webContents.send(`server:log:${id}`, line.trim())
    })
    proc.stderr.on('data', (data) => {
      const line = data.toString()
      logFileStream.write(`[ERR][${new Date().toISOString()}] ${line}`)
      win?.webContents.send(`server:log:${id}`, `[ERR] ${line.trim()}`)
    })
    proc.on('exit', (code) => {
      runningServers.delete(id)
      stopPlayerPolling(id)
      win?.webContents.send('server:stopped', { id, code })
      log(`Server exited: ${id} code=${code}`)
      logFileStream.end()
    })

    runningServers.set(id, { process: proc, config, logPath, startedAt: Date.now() })
    startPlayerPolling(id, config.httpPort)
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
    log(`Server stopped: ${id}`)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

ipcMain.handle('server:stop', (_, id) => stopServerProcess(id))

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

function startShmTelemetry() {
  if (!telemetryManager) {
    telemetryManager = new TelemetryManager({
      onFrame: (frame) => {
        win?.webContents.send('telemetry:frame', frame)
        overlayWindow?.webContents.send('telemetry:frame', frame)
        clusterOverlayWindow?.webContents.send('telemetry:frame', frame)
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

// ── IPC: Telemetry overlay window ─────────────────────────────────────────────
ipcMain.handle('telemetry:openOverlay', async (_, config = {}) => {
  if (overlayWindow) { overlayWindow.focus(); return { ok: true, alreadyOpen: true } }
  try {
    overlayWindow = new BrowserWindow({
      width: config.width || 800,
      height: config.height || 200,
      x: config.x, y: config.y,
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
  if (clusterOverlayWindow) { clusterOverlayWindow.focus(); return { ok: true, alreadyOpen: true } }
  try {
    clusterOverlayWindow = new BrowserWindow({
      width: config.layout.canvasWidth + 16,
      height: config.layout.canvasHeight + 16,
      x: config.x ?? 100,
      y: config.y ?? 100,
      alwaysOnTop: config.alwaysOnTop ?? true,
      transparent: true,
      frame: false,
      skipTaskbar: false,
      resizable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
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
    { label: 'Toggle always on top', click: () => { clusterOverlayWindow?.setAlwaysOnTop(!clusterOverlayWindow.isAlwaysOnTop()) } },
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
// Best-guess LAN/Tailscale IPv4 for the invite Share modal to prefill — the
// host running the AC server, not the chat backend, so friends can /connect
// straight to it. Editable in the UI since a machine on both networks needs
// to pick whichever address its friends can actually reach.
ipcMain.handle('network:localIp', () => {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
})

// ── IPC: Machine hostname (Phase 12 host registration) ───────────────────────
ipcMain.handle('system:hostname', () => os.hostname())

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
      const layoutsDir = path.join(tracksDir, name, 'layouts')
      const layouts = fs.existsSync(layoutsDir) ? fs.readdirSync(layoutsDir) : ['default']
      return { name, hasTraffic, layouts, path: path.join(tracksDir, name) }
    })
    return { ok: true, tracks }
  } catch (e) {
    return { ok: false, error: e.message, tracks: [] }
  }
})
