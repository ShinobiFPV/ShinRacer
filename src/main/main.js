const { app, BrowserWindow, ipcMain, dialog, shell, Notification, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const dgram = require('dgram')
const { spawn, execSync } = require('child_process')
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
    backgroundColor: '#0D0F12',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#13161A',
      symbolColor: '#E8ECF0',
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
function handleAccompUrl(url) {
  log(`accomp:// URL received: ${url}`)
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
