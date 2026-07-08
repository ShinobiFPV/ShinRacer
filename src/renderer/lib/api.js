import axios from 'axios'

const DEFAULT_BACKEND_URL = 'http://192.168.1.203:3000'

const api = axios.create({ baseURL: DEFAULT_BACKEND_URL, timeout: 10000 })

// Backend URL lives in electron-store — pull it in as soon as the bridge is available.
;(async () => {
  try {
    const stored = await window.api?.store.get('backendUrl')
    if (stored) api.defaults.baseURL = stored
  } catch (e) { /* preload not ready yet — default stays in place */ }
})()

export function setBackendUrl(url) {
  api.defaults.baseURL = url || DEFAULT_BACKEND_URL
}

export function getBackendUrl() {
  return api.defaults.baseURL
}

export default api
