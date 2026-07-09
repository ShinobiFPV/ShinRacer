import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/colors'
import { Btn, TextInput, Label } from '../components/primitives'
import api, { DEFAULT_BACKEND_URL, setBackendUrl, getBackendUrl } from '../lib/api'
import { setOnboarded, getIdentity } from '../lib/auth'
import { useAuth } from '../hooks/useAuth'

const GUEST_CHECKLIST = [
  { ok: true, label: 'View events' },
  { ok: true, label: 'Browse mods (no install — no local AC)' },
  { ok: true, label: 'Useful links' },
  { ok: false, label: 'Accept events (needs identity)' },
  { ok: false, label: 'Voice/text comms (needs identity)' },
  { ok: false, label: 'Upload mods (needs Google auth)' },
  { ok: false, label: 'Lap stats (needs AC running locally)' },
]

function Screen({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '24px 24px calc(24px + env(safe-area-inset-bottom))', gap: 16,
    }}>
      {children}
    </div>
  )
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const auth = useAuth()
  const startedOnStep = new URLSearchParams(window.location.search).get('step') === 'done' ? 4 : 1
  const [step, setStep] = useState(startedOnStep)
  const [backendUrl, setBackendUrlInput] = useState(getBackendUrl() || DEFAULT_BACKEND_URL)
  const [testResult, setTestResult] = useState(null) // null | 'ok' | 'fail'
  const [testing, setTesting] = useState(false)
  const [isGuest, setIsGuest] = useState(!auth.user)
  const [signInError, setSignInError] = useState(null)

  async function testConnection() {
    setTesting(true)
    setBackendUrl(backendUrl)
    try {
      const { data } = await api.get('/api/health', { timeout: 5000 })
      setTestResult(data.ok ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    } finally {
      setTesting(false)
    }
  }

  async function signIn() {
    try {
      setSignInError(null)
      await auth.login('/onboarding')
    } catch (e) {
      setSignInError(e.message)
    }
  }

  function finish() {
    setOnboarded()
    navigate('/events', { replace: true })
  }

  if (step === 1) {
    return (
      <Screen>
        <div style={{ fontFamily: C.head, fontSize: 48, letterSpacing: 2 }}>
          <span style={{ color: C.blue }}>SHIN</span>RACER
        </div>
        <div style={{ fontSize: 16, color: C.muted }}>Race. Drift. Coordinate.</div>
        <div style={{ fontSize: 14, color: C.muted }}>Built for the crew by the crew.</div>
        <Btn size="lg" onClick={() => setStep(2)} style={{ marginTop: 24 }}>Get started</Btn>
      </Screen>
    )
  }

  if (step === 2) {
    return (
      <Screen>
        <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 1 }}>Where's the crew?</div>
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'left' }}>
          <Label>Backend URL</Label>
          <TextInput value={backendUrl} onChange={setBackendUrlInput} placeholder={DEFAULT_BACKEND_URL} />
          <Btn full onClick={testConnection} disabled={testing} style={{ marginTop: 12 }}>
            {testing ? 'Testing…' : 'Test connection'}
          </Btn>
          {testResult === 'ok' && <div style={{ color: C.green, fontSize: 13, marginTop: 8 }}>Connected — the crew is here.</div>}
          {testResult === 'fail' && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>Couldn't reach it. Make sure you're on Tailscale.</div>}
        </div>
        <Btn size="lg" onClick={() => { setBackendUrl(backendUrl); setStep(3) }} style={{ marginTop: 8 }}>Continue</Btn>
        <button onClick={() => setStep(3)} style={{ fontSize: 13, color: C.muted, textDecoration: 'underline' }}>
          Skip — I'll set this later
        </button>
      </Screen>
    )
  }

  if (step === 3) {
    return (
      <Screen>
        <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 1 }}>Who are you?</div>
        <Btn size="lg" full style={{ maxWidth: 320, background: '#fff', color: '#3c4043', border: '1px solid #dadce0' }} onClick={signIn}>
          Sign in with Google
        </Btn>
        {signInError && <div style={{ color: C.red, fontSize: 13 }}>{signInError}</div>}
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 320 }}>Sign in to access mods and comms.</div>
        <button onClick={() => { setIsGuest(true); setStep(4) }} style={{ fontSize: 13, color: C.blue, textDecoration: 'underline', marginTop: 8 }}>
          Continue as guest
        </button>
        <div style={{ maxWidth: 320, textAlign: 'left', marginTop: 20, width: '100%' }}>
          <Label>Guest mode</Label>
          {GUEST_CHECKLIST.map(item => (
            <div key={item.label} style={{ display: 'flex', gap: 8, fontSize: 13, color: item.ok ? C.textSec : C.muted, padding: '4px 0' }}>
              <span style={{ color: item.ok ? C.green : C.red }}>{item.ok ? '✓' : '✗'}</span>
              {item.label}
            </div>
          ))}
        </div>
      </Screen>
    )
  }

  // Step 4 — Done. Reached either via "Continue as guest" (same SPA session)
  // or via a full redirect back from Google through /auth/callback?step=done
  // (auth state lives in localStorage by then, so useAuth() picks it up fresh).
  const identity = getIdentity()
  const name = auth.user?.name || identity?.handle
  return (
    <Screen>
      {auth.user?.picture && (
        <img src={auth.user.picture} alt="" style={{ width: 72, height: 72, border: `2px solid ${C.blue}` }} />
      )}
      <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 1 }}>
        {name ? `You're in, ${name}.` : "You're in."}
      </div>
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 320 }}>
        {isGuest && !auth.user
          ? 'Guest mode: events and links are open to browse. Sign in anytime from Settings for comms, accepting events, and uploads.'
          : 'Full access — events, comms, mods, and stats are all yours.'}
      </div>
      <Btn size="lg" onClick={finish} style={{ marginTop: 16 }}>Open ShinRacer</Btn>
    </Screen>
  )
}
