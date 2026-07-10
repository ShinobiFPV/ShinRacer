const { contextBridge, ipcRenderer } = require('electron')

// Safe bridge — renderer never touches Node directly
contextBridge.exposeInMainWorld('api', {
  // Settings store
  store: {
    get:    (key)        => ipcRenderer.invoke('store:get', key),
    set:    (key, value) => ipcRenderer.invoke('store:set', key, value),
    getAll: ()           => ipcRenderer.invoke('store:getAll'),
  },

  // Dialogs
  dialog: {
    openFolder: (opts) => ipcRenderer.invoke('dialog:openFolder', opts),
    openFile:   (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  },

  // Shell
  shell: {
    openPath:     (p)   => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    runCommand:   (cmd) => ipcRenderer.invoke('shell:runCommand', cmd),
  },

  // Filesystem
  fs: {
    exists:    (p)       => ipcRenderer.invoke('fs:exists', p),
    readFile:  (p)       => ipcRenderer.invoke('fs:readFile', p),
    writeFile: (p, data) => ipcRenderer.invoke('fs:writeFile', p, data),
    readDir:   (p)       => ipcRenderer.invoke('fs:readDir', p),
    copyFile:  (s, d)    => ipcRenderer.invoke('fs:copyFile', s, d),
    makeDir:   (p)       => ipcRenderer.invoke('fs:makeDir', p),
  },

  // AC server process
  server: {
    launch:  (config)   => ipcRenderer.invoke('server:launch', config),
    stop:    (id)       => ipcRenderer.invoke('server:stop', id),
    list:    ()         => ipcRenderer.invoke('server:list'),
    readLog: (p, lines) => ipcRenderer.invoke('server:readLog', p, lines),
    onLog:   (id, cb)   => {
      const channel = `server:log:${id}`
      ipcRenderer.on(channel, (_, line) => cb(line))
      return () => ipcRenderer.removeAllListeners(channel)
    },
    onStopped: (cb) => {
      ipcRenderer.on('server:stopped', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('server:stopped')
    },
    onPlayers: (id, cb) => {
      const channel = `server:players:${id}`
      ipcRenderer.on(channel, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(channel)
    },
  },

  // Traffic config
  traffic: {
    saveConfig:   (args) => ipcRenderer.invoke('traffic:saveConfig', args),
    loadExisting: (p)    => ipcRenderer.invoke('traffic:loadExisting', p),
  },

  // AC detection
  ac: {
    detect:    ()        => ipcRenderer.invoke('ac:detect'),
    scanTracks: (p)      => ipcRenderer.invoke('ac:scanTracks', p),
    launch:    ()        => ipcRenderer.invoke('ac:launch'),
  },

  // UDP lap telemetry + AC Shared Memory live telemetry + overlay window
  telemetry: {
    start: (port) => ipcRenderer.invoke('telemetry:start', port),
    stop:  ()     => ipcRenderer.invoke('telemetry:stop'),
    onLap: (cb) => {
      ipcRenderer.on('telemetry:lap', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('telemetry:lap')
    },
    onError: (cb) => {
      ipcRenderer.on('telemetry:error', (_, msg) => cb(msg))
      return () => ipcRenderer.removeAllListeners('telemetry:error')
    },

    // Shared-memory live telemetry (physics/graphics/static frames) — since
    // Phase 13, multi-game via TelemetryManager (AC1/ACC/AC Evo/AC Rally
    // over shared memory, FH5/FH6 over UDP), all normalized to one frame shape.
    shmStart: () => ipcRenderer.invoke('telemetry:shmStart'),
    shmStop:  () => ipcRenderer.invoke('telemetry:shmStop'),
    onFrame:  (cb) => {
      ipcRenderer.on('telemetry:frame', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('telemetry:frame')
    },

    // Phase 13: multi-game detection
    getActiveGame: () => ipcRenderer.invoke('telemetry:getActiveGame'),
    setForzaPort:  (p) => ipcRenderer.invoke('telemetry:setForzaPort', p),
    onGameDetected: (cb) => {
      ipcRenderer.on('game:detected', (_, game) => cb(game))
      return () => ipcRenderer.removeAllListeners('game:detected')
    },
    onGameLost: (cb) => {
      ipcRenderer.on('game:lost', (_, game) => cb(game))
      return () => ipcRenderer.removeAllListeners('game:lost')
    },
    onWarning: (cb) => {
      ipcRenderer.on('telemetry:warning', (_, message) => cb(message))
      return () => ipcRenderer.removeAllListeners('telemetry:warning')
    },

    // Overlay window
    openOverlay:            (cfg) => ipcRenderer.invoke('telemetry:openOverlay', cfg),
    closeOverlay:           ()    => ipcRenderer.invoke('telemetry:closeOverlay'),
    setOverlayOpacity:      (v)   => ipcRenderer.invoke('telemetry:setOverlayOpacity', v),
    setOverlayAlwaysOnTop:  (v)   => ipcRenderer.invoke('telemetry:setOverlayAlwaysOnTop', v),
    setOverlayBounds:       (b)   => ipcRenderer.invoke('telemetry:setOverlayBounds', b),
    overlayStatus:          ()    => ipcRenderer.invoke('telemetry:overlayStatus'),
    showOverlayContextMenu: ()    => ipcRenderer.invoke('telemetry:showOverlayContextMenu'),
    onOverlayClosed: (cb) => {
      ipcRenderer.on('telemetry:overlayClosed', () => cb())
      return () => ipcRenderer.removeAllListeners('telemetry:overlayClosed')
    },
  },

  // Local network info (invite Share modal host prefill)
  network: {
    getLocalIp: () => ipcRenderer.invoke('network:localIp'),
  },

  // Machine hostname (Phase 12 host registration — SettingsView + Wizard)
  system: {
    hostname: () => ipcRenderer.invoke('system:hostname'),
  },

  // Port availability check (Host Status readiness checklist)
  net: {
    checkPortAvailable: (port) => ipcRenderer.invoke('net:checkPortAvailable', port),
  },

  // accomp:// protocol — invite links + "Connect in AC" round-trips
  protocol: {
    onOpen: (cb) => {
      ipcRenderer.on('accomp:open', (_, url) => cb(url))
      return () => ipcRenderer.removeAllListeners('accomp:open')
    },
  },

  // Event reminder notifications
  reminders: {
    check: (events) => ipcRenderer.invoke('reminders:check', events),
  },

  // Main-process log files
  logs: {
    openFolder: () => ipcRenderer.invoke('logs:openFolder'),
  },

  // Replay browser
  replays: {
    scan:        ()  => ipcRenderer.invoke('replays:scan'),
    getMetadata: (p) => ipcRenderer.invoke('replays:getMetadata', p),
    launch:      (p) => ipcRenderer.invoke('replays:launch', p),
    openFolder:  ()  => ipcRenderer.invoke('replays:openFolder'),
  },

  // Mod Manager — download/install + Google OAuth callback
  mods: {
    download:   (args) => ipcRenderer.invoke('mods:download', args),
    openFolder: (cat)  => ipcRenderer.invoke('mods:openFolder', cat),
  },
  auth: {
    startCallbackServer: () => ipcRenderer.invoke('auth:startCallbackServer'),
    stopCallbackServer:  () => ipcRenderer.invoke('auth:stopCallbackServer'),
    onCallback: (cb) => {
      ipcRenderer.on('oauth:callback', (_, code) => cb(code))
      return () => ipcRenderer.removeAllListeners('oauth:callback')
    },
  },

  // The Cluster Fucker — keystroke dispatch, overlay window, app-function calls
  cluster: {
    sendKey:      (key)    => ipcRenderer.invoke('cluster:sendKey', { key }),
    callFn:       (fn, param) => ipcRenderer.invoke('cluster:callFn', { fn, param }),
    openOverlay:  (config) => ipcRenderer.invoke('cluster:openOverlay', config),
    closeOverlay: ()       => ipcRenderer.invoke('cluster:closeOverlay'),
    overlayStatus: ()      => ipcRenderer.invoke('cluster:overlayStatus'),
    showOverlayContextMenu: () => ipcRenderer.invoke('cluster:showOverlayContextMenu'),
    onOverlayClosed: (cb) => {
      ipcRenderer.on('cluster:overlayClosed', () => cb())
      return () => ipcRenderer.removeAllListeners('cluster:overlayClosed')
    },
    // Fired for appFunctions main.js can't handle itself (needs renderer-side
    // app state — settings/profiles/WebRTC mic state/current view). App.jsx
    // owns dispatching these; see its cluster:invoke listener.
    onInvoke: (cb) => {
      ipcRenderer.on('cluster:invoke', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('cluster:invoke')
    },
    // accomp://cluster/{id} deep link — see main.js's handleAccompUrl.
    onLoadPreset: (cb) => {
      ipcRenderer.on('cluster:loadPreset', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('cluster:loadPreset')
    },
  },

  // FPV Drone Assistant (Phase 14) — sug44/FpvDroneForAC install check + preset files
  fpv: {
    checkInstall:  ()           => ipcRenderer.invoke('fpv:checkInstall'),
    readPresets:   ()           => ipcRenderer.invoke('fpv:readPresets'),
    readPreset:    (name)       => ipcRenderer.invoke('fpv:readPreset', name),
    writePreset:   (name, data) => ipcRenderer.invoke('fpv:writePreset', { name, data }),
    deletePreset:  (name)       => ipcRenderer.invoke('fpv:deletePreset', name),
    readMapImage:  (track)      => ipcRenderer.invoke('fpv:readMapImage', track),
  },
})
