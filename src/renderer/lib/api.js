import axios from 'axios'

const DEFAULT_BACKEND_URL = 'http://192.168.1.100:3000'

const api = axios.create({ baseURL: DEFAULT_BACKEND_URL, timeout: 10000 })

const urlListeners = new Set()

// Backend URL lives in electron-store — pull it in as soon as the bridge is available.
;(async () => {
  try {
    const stored = await window.api?.store.get('backendUrl')
    if (stored) setBackendUrl(stored)
  } catch (e) { /* preload not ready yet — default stays in place */ }
})()

export function setBackendUrl(url) {
  api.defaults.baseURL = url || DEFAULT_BACKEND_URL
  urlListeners.forEach(fn => fn(api.defaults.baseURL))
}

export function getBackendUrl() {
  return api.defaults.baseURL
}

// Lets other singletons (e.g. useSocket's shared connection) react when
// Settings changes the backend URL, instead of polling.
export function onBackendUrlChange(fn) {
  urlListeners.add(fn)
  return () => urlListeners.delete(fn)
}

// Phase 12: every route on the backend now requires a Google ID token.
// Reads electron-store fresh on every request (rather than caching the
// token in a module variable) so a sign-in, token refresh, or sign-out from
// AppStore.jsx is picked up on the very next request with no pubsub needed —
// unlike the backend URL above, the token is never read synchronously
// anywhere, so there's no reason to keep an in-memory copy in sync.
api.interceptors.request.use(async (config) => {
  try {
    const auth = await window.api?.store.get('googleAuth')
    if (auth?.idToken) config.headers.Authorization = `Bearer ${auth.idToken}`
  } catch (e) { /* preload not ready / not signed in — request goes out unauthenticated and the backend 401s it */ }
  return config
})

export default api
