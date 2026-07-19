// ShinRacer Lite is a second electron-builder installer target built from
// this exact same src/ tree (see electron-builder-lite.yml at the repo
// root) — Vite bakes VITE_APP_VARIANT in at build time via vite.config.js's
// __APP_VARIANT__ define, the same mechanism AppStore.jsx already uses for
// __BACKEND_URL__.
export const APP_VARIANT = typeof __APP_VARIANT__ !== 'undefined' ? __APP_VARIANT__ : 'full'
export const isLite = APP_VARIANT === 'lite'
