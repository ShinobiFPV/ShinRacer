import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { setBackendUrl } from '../lib/api'

const api = window.api  // injected by preload

const Ctx = createContext(null)

const DEFAULT_QUICK_PHRASES = [
  'Returning to pits', "I've wrecked, I'm out", 'Yellow flag, slow down', 'Good race everyone',
  'Ready when you are', 'Give me 2 mins', 'On my way to grid', 'GG',
]

const DEFAULT_SETTINGS = {
  acPath: '',
  acServerExe: '',
  serverName: 'ShinTech AC Server',
  adminPassword: 'admin',
  backendUrl: 'http://192.168.1.203:3000',
  quickPhrases: DEFAULT_QUICK_PHRASES,
  setupComplete: false,
}

const DEFAULT_IDENTITY = { handle: '', color: '#F5C518' }

export function AppStoreProvider({ children }) {
  const [settings, setSettingsState]   = useState(DEFAULT_SETTINGS)
  const [identity, setIdentityState]   = useState(DEFAULT_IDENTITY)
  const [liveServers, setLiveServers]  = useState([])   // { id, name, config, startedAt, pid, logPath }
  const [profiles, setProfiles]        = useState([])   // server config presets
  const [trafficProfiles, setTrafficProfiles] = useState([])
  const [toast, setToastState]         = useState(null)
  const [acDetected, setAcDetected]    = useState(null) // null | { found, path }

  // Load persisted state on mount
  useEffect(() => {
    ;(async () => {
      const saved = await api.store.getAll()
      if (saved.settings) {
        const next = { ...DEFAULT_SETTINGS, ...saved.settings }
        setSettingsState(next)
        setBackendUrl(next.backendUrl)
      }
      if (saved.profiles)        setProfiles(saved.profiles)
      if (saved.trafficProfiles) setTrafficProfiles(saved.trafficProfiles)

      const savedIdentity = await api.identity.get()
      if (savedIdentity) setIdentityState({ ...DEFAULT_IDENTITY, ...savedIdentity })

      // Detect AC install
      const detected = await api.ac.detect()
      setAcDetected(detected)
      if (detected.found && !saved.settings?.acPath) {
        const acPath = detected.path
        const exe    = `${acPath}\\server\\acServer.exe`
        const next   = { ...DEFAULT_SETTINGS, acPath, acServerExe: exe }
        setSettingsState(next)
        await api.store.set('settings', next)
      }

      // Re-hydrate any servers that were running (best-effort)
      const running = await api.server.list()
      setLiveServers(running.map(s => ({ ...s.config, pid: s.pid, startedAt: s.startedAt, logPath: s.logPath })))
    })()

    // Listen for servers dying
    const unsub = api.server.onStopped(({ id }) => {
      setLiveServers(prev => prev.filter(s => s.id !== id))
    })
    return unsub
  }, [])

  const saveSettings = useCallback(async (patch) => {
    const next = { ...settings, ...patch }
    setSettingsState(next)
    setBackendUrl(next.backendUrl)
    await api.store.set('settings', next)
  }, [settings])

  const saveIdentity = useCallback(async (patch) => {
    const next = { ...identity, ...patch }
    setIdentityState(next)
    await api.identity.set(next)
  }, [identity])

  const saveProfiles = useCallback(async (next) => {
    setProfiles(next)
    await api.store.set('profiles', next)
  }, [])

  const saveTrafficProfiles = useCallback(async (next) => {
    setTrafficProfiles(next)
    await api.store.set('trafficProfiles', next)
  }, [])

  const addLiveServer = useCallback((s) => setLiveServers(prev => [...prev, s]), [])
  const removeLiveServer = useCallback((id) => setLiveServers(prev => prev.filter(s => s.id !== id)), [])

  const showToast = useCallback((msg, color) => {
    setToastState({ msg, color, key: Date.now() })
    setTimeout(() => setToastState(null), 2800)
  }, [])

  return (
    <Ctx.Provider value={{
      settings, saveSettings,
      identity, saveIdentity,
      profiles, saveProfiles,
      trafficProfiles, saveTrafficProfiles,
      liveServers, addLiveServer, removeLiveServer,
      toast, showToast,
      acDetected,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
