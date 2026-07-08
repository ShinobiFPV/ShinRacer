const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const dgram = require('dgram')
const { spawn, execSync } = require('child_process')
const Store = require('electron-store')

const isDev = process.argv.includes('--dev')
const store = new Store()

// ── Running server processes (pid → { process, config }) ─────────────────────
const runningServers = new Map()

// ── UDP telemetry socket ──────────────────────────────────────────────────────
let telemetrySocket = null

// ── Window ────────────────────────────────────────────────────────────────────
let win

function createWindow() {
  win = new BrowserWindow({
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
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.on('closed', () => {
    // Kill all server processes on window close
    for (const [id, entry] of runningServers) {
      try { entry.process.kill() } catch (e) {}
    }
    if (telemetrySocket) {
      try { telemetrySocket.close() } catch (e) {}
      telemetrySocket = null
    }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

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
    const logStream = fs.createWriteStream(logPath, { flags: 'a' })

    proc.stdout.on('data', (data) => {
      const line = data.toString()
      logStream.write(`[${new Date().toISOString()}] ${line}`)
      win?.webContents.send(`server:log:${id}`, line.trim())
    })
    proc.stderr.on('data', (data) => {
      const line = data.toString()
      logStream.write(`[ERR][${new Date().toISOString()}] ${line}`)
      win?.webContents.send(`server:log:${id}`, `[ERR] ${line.trim()}`)
    })
    proc.on('exit', (code) => {
      runningServers.delete(id)
      win?.webContents.send('server:stopped', { id, code })
      logStream.end()
    })

    runningServers.set(id, { process: proc, config, logPath, startedAt: Date.now() })
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
      return { found: true, path: p }
    }
  }
  return { found: false, path: null }
})

// ── IPC: UDP telemetry listener ───────────────────────────────────────────────
// AC broadcasts RT_CAR_INFO packets on the LIVE_TELEMETRY UDP port. RT_LAP (0x22):
// byte 0 = id, bytes 1-4 = car index, 5-8 = lap time ms, 9-12 = sector1 ms, 13-16 = sector2 ms.
ipcMain.handle('telemetry:start', (_, port = 9996) => {
  return new Promise((resolve) => {
    if (telemetrySocket) { resolve({ ok: true, alreadyRunning: true, port }); return }
    try {
      const sock = dgram.createSocket('udp4')
      sock.on('error', (err) => {
        win?.webContents.send('telemetry:error', err.message)
      })
      sock.on('message', (msg) => {
        if (msg.length < 17 || msg.readUInt8(0) !== 0x22) return
        win?.webContents.send('telemetry:lap', {
          carIndex:   msg.readUInt32LE(1),
          lapTimeMs:  msg.readUInt32LE(5),
          sector1Ms:  msg.readUInt32LE(9),
          sector2Ms:  msg.readUInt32LE(13),
          ts: Date.now(),
        })
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

// ── IPC: User identity ────────────────────────────────────────────────────────
ipcMain.handle('identity:get', () => store.get('identity'))
ipcMain.handle('identity:set', (_, identity) => { store.set('identity', identity); return true })

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
