import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import httpApi, { setBackendUrl as setApiBackendUrl } from '../lib/api'

const api = window.api  // injected by preload

const Ctx = createContext(null)

const DEFAULT_SETTINGS = {
  acPath: '',
  acServerExe: '',
  serverName: 'ShinTech AC Server',
  adminPassword: 'admin',
  setupComplete: false,
}

const DEFAULT_IDENTITY = { handle: '', color: '#F5C518' }
export const DEFAULT_BACKEND_URL =
  (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : null) || 'http://192.168.1.203:3000'
export const DEFAULT_QUICK_PHRASES = [
  'Returning to pits', "I've wrecked, I'm out", 'Yellow flag, slow down', 'Good race everyone',
  'Ready when you are', 'Give me 2 mins', 'On my way to grid', 'GG',
]

export function AppStoreProvider({ children }) {
  const [settings, setSettingsState]   = useState(DEFAULT_SETTINGS)
  const [identity, setIdentityState]   = useState(DEFAULT_IDENTITY)
  const [backendUrl, setBackendUrlState] = useState(DEFAULT_BACKEND_URL)
  const [quickPhrases, setQuickPhrasesState] = useState(DEFAULT_QUICK_PHRASES)
  const [liveServers, setLiveServers]  = useState([])   // { id, name, config, startedAt, pid, logPath }
  const [profiles, setProfiles]        = useState([])   // server config presets
  const [trafficProfiles, setTrafficProfiles] = useState([])
  const [toast, setToastState]         = useState(null)
  const [acDetected, setAcDetected]    = useState(null) // null | { found, path }
  const [backendOnline, setBackendOnline] = useState(true) // optimistic default; first poll corrects it
  const [hydrated, setHydrated]        = useState(false) // true once persisted state has loaded — gates the first-run Wizard so it doesn't flash for returning users

  const recheckBackend = useCallback(async () => {
    try {
      const res = await httpApi.get('/api/health')
      setBackendOnline(!!res.data?.ok)
    } catch (e) {
      setBackendOnline(false)
    }
  }, [])

  // Poll backend health every 30s
  useEffect(() => {
    recheckBackend()
    const interval = setInterval(recheckBackend, 30000)
    return () => clearInterval(interval)
  }, [recheckBackend])

  // Load persisted state on mount
  useEffect(() => {
    ;(async () => {
      const saved = await api.store.getAll()
      if (saved.settings)        setSettingsState({ ...DEFAULT_SETTINGS, ...saved.settings })
      if (saved.profiles)        setProfiles(saved.profiles)
      if (saved.trafficProfiles) setTrafficProfiles(saved.trafficProfiles)
      if (saved.backendUrl) {
        setBackendUrlState(saved.backendUrl)
        setApiBackendUrl(saved.backendUrl)
      }
      if (saved.quickPhrases?.length) setQuickPhrasesState(saved.quickPhrases)

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

      setHydrated(true)
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
    await api.store.set('settings', next)
  }, [settings])

  const saveIdentity = useCallback(async (patch) => {
    const next = { ...identity, ...patch }
    setIdentityState(next)
    await api.identity.set(next)
  }, [identity])

  const saveBackendUrl = useCallback(async (url) => {
    const next = url || DEFAULT_BACKEND_URL
    setBackendUrlState(next)
    setApiBackendUrl(next)
    await api.store.set('backendUrl', next)
  }, [])

  const saveQuickPhrases = useCallback(async (next) => {
    setQuickPhrasesState(next)
    await api.store.set('quickPhrases', next)
  }, [])

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
      backendUrl, saveBackendUrl,
      quickPhrases, saveQuickPhrases,
      profiles, saveProfiles,
      trafficProfiles, saveTrafficProfiles,
      liveServers, addLiveServer, removeLiveServer,
      toast, showToast,
      acDetected,
      backendOnline, recheckBackend,
      hydrated,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
