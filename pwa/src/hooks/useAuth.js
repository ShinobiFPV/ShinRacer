import { useEffect, useState } from 'react'
import api from '../lib/api'
import {
  generatePKCE, buildGoogleAuthUrl, stashPKCE,
  getStoredAuth, clearAuth, isTokenExpired,
} from '../lib/auth'

// Google sign-in state — separate from crew identity (handle/color), which
// every user has whether signed in or not. This only gates mod uploads.
export function useAuth() {
  const [auth, setAuth] = useState(() => getStoredAuth())

  // If the stored token has expired, invalidate and reprompt rather than
  // silently refreshing — same call the Electron app made in Phase 6 (the
  // spec asked for invalidate-and-reprompt, not a refresh-token exchange).
  useEffect(() => {
    if (auth && isTokenExpired(auth.tokens)) {
      clearAuth()
      setAuth(null)
    }
  }, [auth])

  async function login(returnTo = '/events') {
    const { data } = await api.get('/api/auth/config')
    if (!data.ok || !data.data.clientId || !data.data.redirectUri) {
      throw new Error('Google sign-in is not configured on the backend yet.')
    }
    const { clientId, redirectUri } = data.data
    const { verifier, challenge } = await generatePKCE()
    stashPKCE(verifier, redirectUri, returnTo)
    window.location.href = buildGoogleAuthUrl(clientId, redirectUri, challenge)
  }

  function logout() {
    clearAuth()
    setAuth(null)
  }

  return {
    user: auth?.user || null,
    tokens: auth?.tokens || null,
    isLoggedIn: !!auth,
    login,
    logout,
    // Called by AuthCallbackPage once the code exchange resolves, so every
    // consumer of this hook re-renders with the new signed-in state.
    setAuthFromCallback: setAuth,
  }
}
