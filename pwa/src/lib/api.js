import axios from 'axios'

export const DEFAULT_BACKEND_URL = 'http://192.168.1.203:3000'
const STORAGE_KEY = 'shinracer_backend_url'

const stored = (() => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } })()

const api = axios.create({ baseURL: stored || DEFAULT_BACKEND_URL, timeout: 10000 })

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
