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
    }
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
  },

  // UDP lap telemetry
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
  },

  // User identity
  identity: {
    get: ()     => ipcRenderer.invoke('identity:get'),
    set: (id)   => ipcRenderer.invoke('identity:set', id),
  },
})
