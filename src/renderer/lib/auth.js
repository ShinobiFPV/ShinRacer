import httpApi from './api'

// Thin wrappers around the existing, working Electron OAuth flow —
// GET /api/mods/auth/url (server builds the Google auth URL) +
// POST /api/mods/auth/callback (code exchange) + POST /api/auth/google
// (role resolution / token refresh). These were previously inlined in
// AppStore.jsx; extracted here for reuse/testing without changing the
// underlying mechanism — see CLAUDE.md's OAuth renderer fix notes for why
// this endpoint pair was kept instead of building the auth URL client-side
// from GET /api/auth/config.
//
// Redirect URI: Google's OAuth 2.0 policy for "Desktop app" clients rejects
// custom URI scheme redirects (accomp://oauth) with a 400: invalid_request
// at the consent screen — the supported mechanism is a loopback IP address
// redirect instead (https://developers.google.com/identity/protocols/oauth2/native-app).
// main.js's 'auth:startCallbackServer' IPC handler runs a temporary local
// HTTP server on this exact port to catch the redirect; the port is fixed
// (not randomized) so it can be registered once in Google Cloud Console —
// see docs/GOOGLE_OAUTH_SETUP.md.
export const OAUTH_CALLBACK_PORT = 9721
const LOOPBACK_REDIRECT_URI = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`

export async function getGoogleAuthUrl() {
  const { data } = await httpApi.get('/api/mods/auth/url', { params: { redirectUri: LOOPBACK_REDIRECT_URI } })
  if (!data.ok) throw new Error(data.error || 'Could not build a Google sign-in URL')
  return data.data.url
}

export async function exchangeCodeForTokens(code) {
  const { data } = await httpApi.post('/api/mods/auth/callback', { code, redirectUri: LOOPBACK_REDIRECT_URI })
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
