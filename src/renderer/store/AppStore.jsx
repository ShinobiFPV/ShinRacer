import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import httpApi, { setBackendUrl as setApiBackendUrl } from '../lib/api'
import { getGoogleAuthUrl, exchangeCodeForTokens, verifyAndSignIn, refreshAuth, isTokenExpired } from '../lib/auth'
import { C } from '../components/primitives'

const api = window.api  // injected by preload

const Ctx = createContext(null)

const DEFAULT_SETTINGS = {
  acPath: '',
  acServerExe: '',
  serverName: 'ShinTech AC Server',
  adminPassword: 'admin',
  upnpEnabled: true,
  setupComplete: false,
}

// Kept as the shape every existing view already reads via useStore().identity
// (CommsView, EventsView, StatsView, ModsView, ClusterView, LinksView) —
// Phase 12 changes *where* handle/color come from (derived from googleAuth
// below, a display preference set after Google sign-in) but not what they
// look like to everything that already consumes them. This is deliberate:
// it's the difference between "add Google auth" and "rewrite six views."
const DEFAULT_IDENTITY = { handle: '', color: '#0066FF' }
export const DEFAULT_BACKEND_URL =
  (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : null) || 'http://192.168.1.100:3000'
export const DEFAULT_QUICK_PHRASES = [
  'Returning to pits', "I've wrecked, I'm out", 'Yellow flag, slow down', 'Good race everyone',
  'Ready when you are', 'Give me 2 mins', 'On my way to grid', 'GG',
]

// AI Race Engineer — optional, off by default. Independent top-level store
// key (never nested inside `settings` — see Phase 2's backendUrl bug note in
// CLAUDE.md). API key/model/baseUrl are entirely the driver's own; nothing
// here is ever sent to backendUrl or any Q2/imq2 endpoint.
export const DEFAULT_AI_ENGINEER = {
  enabled: false,
  provider: 'claude', // 'claude' | 'openai' | 'local'
  apiKey: '',
  model: '',
  localBaseUrl: '',
  alertsEnabled: true,
  // Voice — push-to-talk only, no wake word. Deepgram handles both directions
  // (speech-to-text for the mic button, text-to-speech for spoken replies),
  // same as imq2's voice pipeline, but with only the Deepgram backend and no
  // VAD/wake-word auto-listening — every turn is an explicit hold-to-talk.
  voice: {
    enabled: false,
    deepgramApiKey: '',
    sttModel: 'nova-3',
    ttsModel: 'aura-2-zeus-en',
  },
}

function shapeAuthUser(data) {
  return { uid: data.uid, email: data.email, name: data.name, picture: data.picture }
}

export function AppStoreProvider({ children }) {
  const [settings, setSettingsState]   = useState(DEFAULT_SETTINGS)
  const [backendUrl, setBackendUrlState] = useState(DEFAULT_BACKEND_URL)
  const [quickPhrases, setQuickPhrasesState] = useState(DEFAULT_QUICK_PHRASES)
  const [aiEngineer, setAiEngineerState] = useState(DEFAULT_AI_ENGINEER)
  // Runtime Lite Mode — a personal toggle on the Full build that hides the
  // same nav items ShinRacer Lite's own build-time variant hides (see
  // App.jsx's LITE_VISIBLE/inVariant). Independent of the isLite build flag
  // in lib/variant.js: this is a preference a Full-install user can flip
  // for themselves, not a separate installer.
  const [liteMode, setLiteModeState] = useState(false)
  const [liveServers, setLiveServers]  = useState([])   // { id, name, config, startedAt, pid, logPath }
  const [profiles, setProfiles]        = useState([])   // server config presets
  const [trafficProfiles, setTrafficProfiles] = useState([])
  const [toast, setToastState]         = useState(null)
  const [acDetected, setAcDetected]    = useState(null) // null | { found, path }
  const [backendOnline, setBackendOnline] = useState(true) // optimistic default; first poll corrects it
  const [hydrated, setHydrated]        = useState(false) // true once persisted state has loaded — gates the first-run Wizard so it doesn't flash for returning users

  // ── Google auth (Phase 12) ─────────────────────────────────────────────────
  // googleAuth is the single source of truth for "am I signed in" — see its
  // shape below in signIn(). identity/{handle,color} is derived from it so
  // every pre-Phase-12 view's contract stays intact.
  const [googleAuth, setGoogleAuthState] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Was a plain inline object literal — a brand-new reference on every single
  // AppStoreProvider render, regardless of whether googleAuth actually
  // changed. Any effect keying off `identity` (e.g. ShareModal's invite
  // creation, `useEffect([server, identity])`) saw a "new" identity on every
  // unrelated re-render anywhere in the app and re-ran — the real cause of
  // invite codes/QR codes cycling continuously in the Share modal. Memoized
  // on the actual primitive values so it's only a new object when the
  // identity itself changes.
  const identity = useMemo(
    () => (googleAuth ? { handle: googleAuth.handle, color: googleAuth.color } : DEFAULT_IDENTITY),
    [googleAuth?.handle, googleAuth?.color]
  )
  const user = googleAuth?.user || null
  const role = googleAuth?.role || null
  const isAdmin = role === 'admin'
  const isHost = role === 'host' || role === 'admin'
  const isCrew = !!googleAuth
  const isSignedIn = !!googleAuth

  const persistGoogleAuth = useCallback(async (next) => {
    setGoogleAuthState(next)
    await api.store.set('googleAuth', next)
  }, [])

  // Declared up here (rather than down near the other simple setters, where
  // it lived before Phase 12) because the accomp://oauth callback effect
  // below needs it — `const` bindings aren't hoisted, so referencing it from
  // an effect defined earlier in this function body than its own `const`
  // line would throw "Cannot access before initialization" the moment that
  // effect actually ran.
  const showToast = useCallback((msg, color) => {
    setToastState({ msg, color, key: Date.now() })
    setTimeout(() => setToastState(null), 2800)
  }, [])

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
      if (saved.aiEngineer) setAiEngineerState({ ...DEFAULT_AI_ENGINEER, ...saved.aiEngineer })
      if (typeof saved.liteMode === 'boolean') setLiteModeState(saved.liteMode)

      // Detect AC install
      const detected = await api.ac.detect()
      setAcDetected(detected)
      if (detected.found && !saved.settings?.acPath) {
        const acPath = detected.path
        const exe    = `${acPath}\\server\\acServer.exe`
        const next   = { ...DEFAULT_SETTINGS, ...saved.settings, acPath, acServerExe: exe }
        setSettingsState(next)
        await api.store.set('settings', next)
      }

      // Re-hydrate any servers that were running (best-effort)
      const running = await api.server.list()
      setLiveServers(running.map(s => ({ ...s.config, pid: s.pid, startedAt: s.startedAt, logPath: s.logPath })))

      // Google auth: verify the stored token is still good (or refresh it if
      // expired) before the rest of the app trusts it. A network failure here
      // keeps the cached auth as-is rather than forcing a sign-out — only an
      // explicit 401 (token actually invalid/revoked) clears it. This mirrors
      // backendOnline's existing "optimistic, corrected on the next check"
      // pattern rather than punishing a briefly-unreachable backend.
      const savedAuth = saved.googleAuth
      if (savedAuth) {
        try {
          const roleData = isTokenExpired(savedAuth.expiryDate)
            ? await refreshAuth(savedAuth.refreshToken)
            : await verifyAndSignIn(savedAuth.idToken)
          const next = {
            ...savedAuth,
            role: roleData.role,
            user: shapeAuthUser(roleData),
            idToken: roleData.idToken || savedAuth.idToken,
            expiryDate: roleData.expiryDate || savedAuth.expiryDate,
          }
          await persistGoogleAuth(next)
        } catch (e) {
          setGoogleAuthState(savedAuth) // network/backend-unreachable — keep cached auth, don't force a re-sign-in
        }
      }
      setAuthLoading(false)

      setHydrated(true)
    })()

    // Listen for servers dying
    const unsub = api.server.onStopped(({ id }) => {
      setLiveServers(prev => prev.filter(s => s.id !== id))
    })
    return unsub
  }, [persistGoogleAuth])

  // signInStatus/pendingProfile/signInError expose the in-progress sign-in
  // state for the Wizard's "Connecting" step (Step 2). There's a real
  // architectural wrinkle here worth being explicit about: the spec's Step 2
  // imagines the *code exchange* succeeding independently of "our" backend
  // and only the *role lookup* (POST /api/auth/google) being able to fail
  // while offline. In this app, both calls go through the backend —
  // exchanging the code for tokens (POST /api/mods/auth/callback) needs the
  // OAuth client secret, which has never left the backend (see
  // docs/GOOGLE_DRIVE_SETUP.md) — so if the backend is genuinely
  // unreachable, the exchange itself fails and there's no Google profile to
  // build even a degraded identity from. "Continue offline" is only
  // actually offerable when the exchange succeeded (we have a real Google
  // profile) but the *role* lookup specifically failed — that narrower case
  // is real and handled below; total backend unreachability during the
  // exchange has nothing to offer but Retry, which is the honest outcome
  // given a client secret that can't be shipped to every crew member's PC.
  const [signInStatus, setSignInStatus] = useState('idle') // idle | exchanging | fetching-role | error | offline-available
  const [pendingProfile, setPendingProfile] = useState(null)
  const [signInError, setSignInError] = useState(null)

  // 5-minute give-up timer for the OAuth loopback callback server — armed
  // when signIn() opens the browser, cleared the moment a callback actually
  // arrives. See signIn() and the api.auth.onCallback effect below.
  const oauthTimeoutRef = useRef(null)

  const applyGoogleAuth = useCallback(async ({ tokens, googleUser, roleData }) => {
    const next = {
      idToken: tokens?.id_token ?? null,
      accessToken: tokens?.access_token ?? null,
      refreshToken: tokens?.refresh_token ?? null,
      expiryDate: tokens?.expiry_date ?? 0,
      user: roleData ? shapeAuthUser(roleData) : googleUser,
      role: roleData?.role || 'crew', // "default to crew" per the offline-mode spec
      // Display preferences — defaulted once, then user-editable in
      // Settings/the wizard's Identity step. Re-signing in doesn't reset
      // these if they're already set.
      handle: googleAuth?.handle || googleUser?.name?.split(' ')[0] || 'Racer',
      color: googleAuth?.color || C.blue,
      offline: !roleData,
    }
    await persistGoogleAuth(next)
    return next
  }, [googleAuth?.handle, googleAuth?.color, persistGoogleAuth])

  // accomp://oauth callback — the one listener for the whole app (Wizard's
  // sign-in button and Settings' "Sign in again" both just call signIn();
  // ModsView no longer runs its own separate OAuth exchange, per Phase 12's
  // "Google sign-in replaces all existing identity systems" — see
  // CLAUDE.md's Phase 12 notes on the ModsView consolidation).
  useEffect(() => {
    const unsub = api.auth.onCallback(async (code) => {
      if (oauthTimeoutRef.current) { clearTimeout(oauthTimeoutRef.current); oauthTimeoutRef.current = null }
      await api.auth.stopCallbackServer()
      setSignInStatus('exchanging')
      setSignInError(null)
      setPendingProfile(null)
      try {
        const { tokens, user: googleUser } = await exchangeCodeForTokens(code)
        setPendingProfile(googleUser)
        setSignInStatus('fetching-role')
        try {
          const roleData = await verifyAndSignIn(tokens.id_token)
          const next = await applyGoogleAuth({ tokens, googleUser, roleData })
          setSignInStatus('idle')
          showToast(`✓ Signed in as ${next.user.name}`)
        } catch (e) {
          // Exchange succeeded (we have a real Google profile) but the role
          // lookup itself couldn't reach the backend — this is the one case
          // "Continue offline" can actually do something with.
          setSignInStatus('offline-available')
          setSignInError(e.message)
        }
      } catch (e) {
        setSignInStatus('error')
        setSignInError(e.message)
      }
    })
    return unsub
  }, [applyGoogleAuth, showToast])

  // Wizard's [CONTINUE OFFLINE] button — only ever reachable from
  // signInStatus === 'offline-available' (see the comment above).
  const continueOffline = useCallback(async () => {
    if (!pendingProfile) return
    const next = await applyGoogleAuth({ tokens: null, googleUser: pendingProfile, roleData: null })
    setSignInStatus('idle')
    return next
  }, [pendingProfile, applyGoogleAuth])

  const signIn = useCallback(async () => {
    await api.auth.startCallbackServer()
    const url = await getGoogleAuthUrl()
    await api.shell.openExternal(url)
    if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current)
    oauthTimeoutRef.current = setTimeout(async () => {
      oauthTimeoutRef.current = null
      await api.auth.stopCallbackServer()
      setSignInStatus('error')
      setSignInError('Sign in timed out — please try again')
    }, 5 * 60 * 1000)
  }, [])

  const signOut = useCallback(async () => {
    await persistGoogleAuth(null)
  }, [persistGoogleAuth])

  const saveSettings = useCallback(async (patch) => {
    const next = { ...settings, ...patch }
    setSettingsState(next)
    await api.store.set('settings', next)
  }, [settings])

  // Handle/color are display preferences layered on top of Google auth now —
  // saving them with nobody signed in yet is a no-op (there's no googleAuth
  // object to attach them to).
  const saveIdentity = useCallback(async (patch) => {
    if (!googleAuth) return
    await persistGoogleAuth({ ...googleAuth, ...patch })
  }, [googleAuth, persistGoogleAuth])

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

  const saveAiEngineer = useCallback(async (patch) => {
    const next = { ...DEFAULT_AI_ENGINEER, ...aiEngineer, ...patch }
    setAiEngineerState(next)
    await api.store.set('aiEngineer', next)
  }, [aiEngineer])

  const saveLiteMode = useCallback(async (next) => {
    setLiteModeState(next)
    await api.store.set('liteMode', next)
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
  const clearLiveServers = useCallback(() => setLiveServers([]), [])

  return (
    <Ctx.Provider value={{
      settings, saveSettings,
      identity, saveIdentity,
      backendUrl, saveBackendUrl,
      quickPhrases, saveQuickPhrases,
      aiEngineer, saveAiEngineer,
      liteMode, saveLiteMode,
      profiles, saveProfiles,
      trafficProfiles, saveTrafficProfiles,
      liveServers, addLiveServer, removeLiveServer, clearLiveServers,
      toast, showToast,
      acDetected,
      backendOnline, recheckBackend,
      hydrated,
      // Phase 12
      googleAuth, user, role, isAdmin, isHost, isCrew, isSignedIn, authLoading,
      signIn, signOut,
      signInStatus, pendingProfile, signInError, continueOffline,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
