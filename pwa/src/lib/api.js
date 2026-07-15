import axios from 'axios'

// The current page's own origin, not a hardcoded absolute URL — nginx
// already proxies /api/ and /socket.io/ to the backend on both the plain-
// HTTP (:8080) and HTTPS/Tailscale-Serve (:8443) listeners (see
// backend/nginx/shinracer.conf), so same-origin always reaches the backend
// correctly regardless of which one the page was loaded from. A hardcoded
// 'http://192.168.1.203:3000' here used to work fine when the PWA only
// ever ran over plain HTTP, but once the page itself loads over HTTPS
// (needed for Google sign-in — see docs/GOOGLE_OAUTH_SETUP.md), every
// request to that http:// URL becomes mixed content and gets silently
// blocked by the browser: no CORS error, no helpful message, just axios's
// generic "Network Error" with no indication why. Falls back to the old
// hardcoded value outside a browser context (shouldn't happen for this
// app in practice, but avoids a crash if it ever does).
export const DEFAULT_BACKEND_URL = typeof window !== 'undefined' ? window.location.origin : 'http://192.168.1.203:3000'
const STORAGE_KEY = 'shinracer_backend_url'

const rawStored = (() => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } })()
// Self-heals a value stored before this fix existed: a phone that onboarded
// while the PWA only ran over :8080 would have this permanently cached as
// http://192.168.1.203:3000/8080, which — same mixed-content problem as
// above — silently breaks every request the moment the page itself loads
// over HTTPS, with no way for the user to know to go clear it in Settings.
const stored = (rawStored && typeof window !== 'undefined' && window.location.protocol === 'https:' && rawStored.startsWith('http://'))
  ? (() => { try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } return null })()
  : rawStored

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
