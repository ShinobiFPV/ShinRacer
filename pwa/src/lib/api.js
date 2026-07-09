import axios from 'axios'

export const DEFAULT_BACKEND_URL = 'http://192.168.1.203:3000'
const STORAGE_KEY = 'shinracer_backend_url'

const stored = (() => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } })()

const api = axios.create({ baseURL: stored || DEFAULT_BACKEND_URL, timeout: 10000 })

// Mirrors lib/auth.js's AUTH_KEY, duplicated rather than imported — auth.js
// already imports this module (for its token-exchange POST), so importing
// back from here would be circular. Every route requires this token now
// (Phase 12's backend-wide requireAuth), so it rides on every request.
const AUTH_STORAGE_KEY = 'shinracer_auth'

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    const auth = raw ? JSON.parse(raw) : null
    if (auth?.tokens?.id_token) config.headers.Authorization = `Bearer ${auth.tokens.id_token}`
  } catch { /* storage unavailable/corrupt — request goes out unauthenticated and 401s cleanly */ }
  return config
})

// A 401 means the backend actually rejected the token (expired/revoked), not
// just that the backend is unreachable — clear the dead session and send the
// user back through sign-in rather than leaving them stuck on a page where
// every call silently fails.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      try { localStorage.removeItem(AUTH_STORAGE_KEY) } catch { /* ignore */ }
      if (!location.pathname.startsWith('/onboarding')) location.href = '/onboarding'
    }
    return Promise.reject(err)
  }
)

const urlListeners = new Set()

export function setBackendUrl(url) {
  const resolved = url || DEFAULT_BACKEND_URL
  api.defaults.baseURL = resolved
  try { localStorage.setItem(STORAGE_KEY, resolved) } catch { /* private browsing / storage full */ }
  urlListeners.forEach(fn => fn(resolved))
}

export function getBackendUrl() {
  return api.defaults.baseURL
}

// Lets useSocket's shared connection react when Settings changes the backend
// URL, instead of polling — same pattern as the Electron app's lib/api.js.
export function onBackendUrlChange(fn) {
  urlListeners.add(fn)
  return () => urlListeners.delete(fn)
}

export default api
