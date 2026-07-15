import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/colors'
import { hashToColor } from '../lib/colors'
import { exchangeCode, parseAuthState, setIdentity, setOnboarded } from '../lib/auth'
import api from '../lib/api'
import { Btn } from '../components/primitives'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const oauthError = params.get('error')

    if (oauthError) { setError(`Google sign-in was cancelled or denied (${oauthError}).`); return }
    if (!code) { setError('No authorization code came back from Google.'); return }

    // The verifier/returnTo travel through OAuth's own `state` param, not
    // browser storage — see lib/auth.js's encodeState/decodeState for why
    // (an installed PWA on iOS can run this redirect in a separate storage
    // partition from the one that receives the callback, which silently
    // broke both a sessionStorage and a localStorage version of this).
    const state = parseAuthState(params.get('state'))
    if (!state?.verifier) { setError('Sign-in state was missing or corrupted — please try again.'); return }

    // redirectUri isn't user-specific, so it isn't part of `state` — just
    // re-fetch the same server-configured value the login button used.
    api.get('/api/auth/config')
      .then(({ data }) => {
        if (!data.ok || !data.data.redirectUri) throw new Error('Google sign-in is not configured on the backend.')
        return exchangeCode(code, state.verifier, data.data.redirectUri)
      })
      .then(({ user }) => {
        setIdentity({ handle: user.name, color: hashToColor(user.name) })
        setOnboarded()
        const returnTo = state.returnTo || '/events'
        navigate(returnTo === '/onboarding' ? '/onboarding?step=done' : returnTo, { replace: true })
      })
      .catch(e => setError(e.message))
  }, [navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      {error ? (
        <div>
          <div style={{ fontFamily: C.head, fontSize: 22, color: C.red, marginBottom: 10 }}>SIGN-IN FAILED</div>
          <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>{error}</div>
          <Btn onClick={() => navigate('/onboarding', { replace: true })}>Back to onboarding</Btn>
        </div>
      ) : (
        <div style={{ fontFamily: C.head, fontSize: 20, color: C.textSec, letterSpacing: 1 }}>Signing you in…</div>
      )}
    </div>
  )
}
