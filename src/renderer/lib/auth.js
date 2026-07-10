import httpApi from './api'

// Thin wrappers around the existing, working Electron OAuth flow —
// GET /api/mods/auth/url (server builds the Google auth URL, defaulting the
// redirect_uri to accomp://oauth) + POST /api/mods/auth/callback (code
// exchange) + POST /api/auth/google (role resolution / token refresh). These
// were previously inlined in AppStore.jsx; extracted here for reuse/testing
// without changing the underlying mechanism — see CLAUDE.md's OAuth renderer
// fix notes for why this endpoint pair was kept instead of building the auth
// URL client-side from GET /api/auth/config.

export async function getGoogleAuthUrl() {
  const { data } = await httpApi.get('/api/mods/auth/url')
  if (!data.ok) throw new Error(data.error || 'Could not build a Google sign-in URL')
  return data.data.url
}

export async function exchangeCodeForTokens(code) {
  const { data } = await httpApi.post('/api/mods/auth/callback', { code })
  if (!data.ok) throw new Error(data.error || 'Google sign-in failed')
  return data.data // { tokens, user: { name, email, picture } }
}

export async function verifyAndSignIn(idToken) {
  const { data } = await httpApi.post('/api/auth/google', { idToken })
  if (!data.ok) throw new Error(data.error || 'Could not verify sign-in')
  return data.data // { uid, email, name, picture, role, isAdmin, isHost }
}

export async function refreshAuth(refreshToken) {
  const { data } = await httpApi.post('/api/auth/google', { refreshToken })
  if (!data.ok) throw new Error(data.error || 'Could not refresh sign-in')
  return data.data // { uid, email, name, picture, role, isAdmin, isHost, idToken, expiryDate }
}

export function isTokenExpired(expiryDate) {
  return !expiryDate || Date.now() > expiryDate - 60000
}
