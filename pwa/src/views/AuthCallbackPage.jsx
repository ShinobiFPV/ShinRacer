import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/colors'
import { hashToColor } from '../lib/colors'
import { exchangeCode, consumeStashedPKCE, setIdentity, setOnboarded } from '../lib/auth'
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

    const stashed = consumeStashedPKCE()
    if (!stashed) { setError('Sign-in session expired — please try again.'); return }

    exchangeCode(code, stashed.verifier, stashed.redirectUri)
      .then(({ user }) => {
        setIdentity({ handle: user.name, color: hashToColor(user.name) })
        setOnboarded()
        const returnTo = stashed.returnTo || '/events'
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
