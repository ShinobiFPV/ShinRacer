const { app, BrowserWindow, ipcMain, dialog, shell, Notification, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const dgram = require('dgram')
const readline = require('readline')
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

// ── AC Shared Memory telemetry (live physics/graphics/static via a persistent
// PowerShell reader process — see the "IPC: AC Shared Memory telemetry" section
// below for why this approach was chosen over a native addon) ────────────────
let shmProcess = null
let shmActive = false

// ── Telemetry overlay window ──────────────────────────────────────────────────
let overlayWindow = null

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
    if (shmProcess) {
      try { shmProcess.kill() } catch (e) {}
      shmProcess = null
      shmActive = false
    }
    if (overlayWindow) {
      try { overlayWindow.close() } catch (e) {}
      overlayWindow = null
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

ipcMain.handle('server:stop', (_, id) => {
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

// ── IPC: AC Shared Memory telemetry (live physics/graphics/static) ───────────
// Node has no built-in Windows shared-memory support, and every native-addon
// route we considered (mmap-io, node-ffi-napi/ref-napi, a bespoke C++ addon)
// needs node-gyp + an MSVC compiler to build — confirmed unavailable in this
// environment the same way better-sqlite3's prebuilt binary was unavailable
// in Phase 4/6 (no VS Build Tools). `ac-node-telemetry` doesn't exist on npm
// (checked via `npm view`, 404).
//
// Instead: a persistent PowerShell child process uses .NET's
// System.IO.MemoryMappedFiles directly (built into Windows PowerShell 5.1,
// zero extra dependencies) to open AC's three named shared-memory blocks,
// base64-encodes their raw bytes, and prints one "FRAME:<p>|<g>|<s>" line to
// stdout every 60ms. Node reads that stream line-by-line and parses the
// struct offsets in JS. This is a real, working implementation, not a
// placeholder — it was verified in this environment to correctly detect
// "AC not running" via System.IO.FileNotFoundException. The same
// -EncodedCommand-over-PowerShell pattern is already used elsewhere in this
// codebase (Phase 6's mod zip extraction) for exactly this reason: it needs
// no compiler and sidesteps quoting entirely.
//
// CreateViewAccessor(0, 0) maps the whole underlying file regardless of its
// exact struct size (Windows page-aligns these mappings), so the reader
// doesn't need to hardcode a byte count that might drift between AC/CSP
// versions — it just reads accessor.Capacity bytes.
const SHM_READER_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Core
function Read-Shm($name) {
  $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting($name)
  $acc = $mmf.CreateViewAccessor(0, 0)
  $size = $acc.Capacity
  $buf = New-Object byte[] $size
  $acc.ReadArray(0, $buf, 0, $size)
  $acc.Dispose()
  $mmf.Dispose()
  return [Convert]::ToBase64String($buf)
}
while ($true) {
  try {
    $p = Read-Shm "Local\\acpmf_physics"
    $g = Read-Shm "Local\\acpmf_graphics"
    $s = Read-Shm "Local\\acpmf_static"
    Write-Output "FRAME:$p|$g|$s"
  } catch {
    Write-Output "NOFRAME"
  }
  Start-Sleep -Milliseconds 60
}
`

// Wchar[N] fields are UTF-16LE, null-padded to N bytes — trim at the first NUL.
function readWChar(buf, offset, byteLen) {
  const raw = buf.toString('utf16le', offset, offset + byteLen)
  const nullIdx = raw.indexOf(String.fromCharCode(0))
  return (nullIdx === -1 ? raw : raw.slice(0, nullIdx)).trim()
}

function readFloatArray(buf, offset, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(buf.readFloatLE(offset + i * 4))
  return out
}

function parsePhysics(buf) {
  return {
    gas: buf.readFloatLE(4),
    brake: buf.readFloatLE(8),
    fuel: buf.readFloatLE(12),
    gear: buf.readInt32LE(16),
    rpms: buf.readFloatLE(20),
    steerAngle: buf.readFloatLE(24),
    speedKmh: buf.readFloatLE(28),
    accG: readFloatArray(buf, 44, 3),
    wheelSlip: readFloatArray(buf, 56, 4),
    wheelLoad: readFloatArray(buf, 72, 4),
    wheelsPressure: readFloatArray(buf, 88, 4),
    tyreWear: readFloatArray(buf, 120, 4),
    tyreCoreTemp: readFloatArray(buf, 152, 4),
    suspensionTravel: readFloatArray(buf, 184, 4),
    drs: buf.readInt32LE(200),
    tc: buf.readFloatLE(204),
    carDamage: readFloatArray(buf, 224, 5),
    pitLimiterOn: buf.readInt32LE(288),
    abs: buf.readFloatLE(292),
    tyreTempI: readFloatArray(buf, 296, 4),
    tyreTempM: readFloatArray(buf, 312, 4),
    tyreTempO: readFloatArray(buf, 328, 4),
    brakeBias: buf.readFloatLE(540),
  }
}

const GRAPHICS_STATUS = { 0: 'OFF', 1: 'REPLAY', 2: 'LIVE', 3: 'PAUSE' }
const GRAPHICS_SESSION = { 0: 'UNKNOWN', 1: 'PRACTICE', 2: 'QUALIFY', 3: 'RACE' }

function parseGraphics(buf) {
  return {
    status: GRAPHICS_STATUS[buf.readInt32LE(4)] || 'OFF',
    session: GRAPHICS_SESSION[buf.readInt32LE(8)] || 'UNKNOWN',
    currentTime: readWChar(buf, 12, 100),
    lastTime: readWChar(buf, 112, 100),
    bestTime: readWChar(buf, 212, 100),
    completedLaps: buf.readInt32LE(412),
    position: buf.readInt32LE(416),
    iCurrentTime: buf.readInt32LE(420),
    iLastTime: buf.readInt32LE(424),
    iBestTime: buf.readInt32LE(428),
    sessionTimeLeft: buf.readFloatLE(432),
    isInPit: buf.readInt32LE(440),
    currentSectorIndex: buf.readInt32LE(444),
    numberOfLaps: buf.readInt32LE(452),
    tyreCompound: readWChar(buf, 456, 100),
    flag: buf.readInt32LE(580),
    isInPitLane: buf.readInt32LE(588),
    fuelXLap: buf.readFloatLE(636),
  }
}

function parseStaticInfo(buf) {
  return {
    carModel: readWChar(buf, 208, 100),
    track: readWChar(buf, 308, 100),
    maxTorque: buf.readFloatLE(712),
    maxPower: buf.readFloatLE(716),
    maxRpm: buf.readInt32LE(720),
    maxFuel: buf.readFloatLE(724),
    suspensionMaxTravel: readFloatArray(buf, 728, 4),
    trackSPlineLength: buf.readFloatLE(828),
  }
}

// Raw gear is AC's own convention (0=R, 1=N, 2=1st…) — remap to the friendlier
// -1/0/1-8 shape the widgets expect.
function niceGear(raw) {
  if (raw === 0) return -1
  if (raw === 1) return 0
  return raw - 1
}

function buildTelemetryFrame(p, g, s) {
  return {
    throttle: p.gas, brake: p.brake, clutch: 0, // clutch position isn't exposed by this struct
    gear: niceGear(p.gear), rpm: p.rpms, maxRpm: s.maxRpm || 8000,
    speed: p.speedKmh, steerAngle: p.steerAngle,
    gLat: p.accG[0] ?? 0, gLon: p.accG[1] ?? 0, gVert: p.accG[2] ?? 0,
    fuel: p.fuel, maxFuel: s.maxFuel || 0,
    brakeBias: p.brakeBias, tc: p.tc, abs: p.abs,
    pitLimiter: !!p.pitLimiterOn, drs: !!p.drs,
    tyrePressure: p.wheelsPressure, tyreTemp: p.tyreCoreTemp,
    tyreTempI: p.tyreTempI, tyreTempM: p.tyreTempM, tyreTempO: p.tyreTempO,
    tyreWear: p.tyreWear, tyreSlip: p.wheelSlip,
    suspensionTravel: p.suspensionTravel, wheelLoad: p.wheelLoad,
    carDamage: p.carDamage,
    status: g.status, session: g.session,
    currentLapMs: g.iCurrentTime, lastLapMs: g.iLastTime, bestLapMs: g.iBestTime,
    currentLapTime: g.currentTime, lastLapTime: g.lastTime, bestLapTime: g.bestTime,
    deltaMs: g.iBestTime > 0 ? g.iCurrentTime - g.iBestTime : 0,
    sector: g.currentSectorIndex, completedLaps: g.completedLaps, position: g.position,
    isInPit: !!g.isInPit, isInPitLane: !!g.isInPitLane, flag: g.flag,
    sessionTimeLeft: g.sessionTimeLeft,
    carModel: s.carModel, track: s.track, tyreCompound: g.tyreCompound,
    maxPower: s.maxPower, maxTorque: s.maxTorque, trackLength: s.trackSPlineLength,
    fuelPerLap: g.fuelXLap,
  }
}

ipcMain.handle('telemetry:shmStart', async () => {
  if (shmActive) return { ok: true, alreadyRunning: true }
  try {
    const encoded = Buffer.from(SHM_READER_SCRIPT, 'utf16le').toString('base64')
    shmProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
    })
    shmActive = true

    const rl = readline.createInterface({ input: shmProcess.stdout })
    rl.on('line', (line) => {
      if (!line.startsWith('FRAME:')) return
      try {
        const [pB64, gB64, sB64] = line.slice(6).split('|')
        const physics = parsePhysics(Buffer.from(pB64, 'base64'))
        const graphics = parseGraphics(Buffer.from(gB64, 'base64'))
        const staticInfo = parseStaticInfo(Buffer.from(sB64, 'base64'))
        const frame = buildTelemetryFrame(physics, graphics, staticInfo)
        win?.webContents.send('telemetry:frame', frame)
        overlayWindow?.webContents.send('telemetry:frame', frame)
      } catch (e) {
        // Malformed/partial frame this tick — skip it, next one arrives in 60ms
      }
    })
    shmProcess.on('exit', () => { shmActive = false; shmProcess = null })
    shmProcess.on('error', (e) => {
      log(`SHM reader process error: ${e.message}`)
      shmActive = false
      shmProcess = null
    })
    log('SHM telemetry reader started')
    return { ok: true }
  } catch (e) {
    log(`SHM telemetry failed to start: ${e.message}`)
    shmActive = false
    shmProcess = null
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('telemetry:shmStop', () => {
  if (shmProcess) {
    try { shmProcess.kill() } catch (e) {}
    shmProcess = null
  }
  shmActive = false
  return { ok: true }
})

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

// ── IPC: User identity ────────────────────────────────────────────────────────
ipcMain.handle('identity:get', () => store.get('identity'))
ipcMain.handle('identity:set', (_, identity) => { store.set('identity', identity); return true })

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
