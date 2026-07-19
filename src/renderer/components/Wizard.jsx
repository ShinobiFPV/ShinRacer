import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import qrcode from 'qrcode-generator'
import { C, Card, Label, Btn, TextInput } from './primitives'
import { DEFAULT_QUICK_PHRASES, DEFAULT_BACKEND_URL, DEFAULT_AI_ENGINEER } from '../store/AppStore'
import { useStore } from '../store/AppStore'
import httpApi from '../lib/api'
import AiEngineerSetup from './AiEngineerSetup'
import { isLite } from '../lib/variant'

const api = window.api

// The PWA is also reachable over plain HTTP on the backend's own host at
// :8080, but Google sign-in only works over the HTTPS URL below —
// crypto.subtle (needed for the PKCE code challenge) only exists in a
// secure context, and Google's OAuth server rejects redirect_uris that are
// bare IP addresses outright. HTTPS is served via Tailscale Serve on a
// dedicated port (:8443, not plain :443 — that port on this hostname is
// already claimed by a different app's Tailscale Funnel). See
// docs/GOOGLE_OAUTH_SETUP.md's "Where the PWA lives" section. This can no
// longer be derived by swapping the backend URL's port the way the old
// :8080 URL was (different scheme AND different host, not just a port),
// so it's a fixed constant now — `backendUrl` is accepted but unused,
// kept only so the PwaStep call site below didn't need to change.
// `qrcode-generator` is already a dependency (used by DeployView's invite QR
// and ClusterView's share QR) — these two helpers live here rather than in a
// `lib/qr.js` module so this step stays a self-contained addition to this one file.
const DEFAULT_PWA_URL = 'https://your-pi.tail9249a1.ts.net:8443'

function getPwaUrl(_backendUrl) {
  return DEFAULT_PWA_URL
}

function generateQRSvg(text, size = 200) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const cellSize = Math.max(1, Math.floor(size / (qr.getModuleCount() + 4)))
  return qr.createSvgTag(cellSize, cellSize * 2)
}
const IDENTITY_COLORS = [C.yellow, C.blue, C.green, C.red, C.orange, '#8E44AD', C.white, C.mutedHi]
const GRID_TEXTURE = 'repeating-linear-gradient(0deg, transparent, transparent 40px, #0A0C1210 40px, #0A0C1210 41px),' +
  'repeating-linear-gradient(90deg, transparent, transparent 40px, #0A0C1210 40px, #0A0C1210 41px)'

// ── Progress indicator ──────────────────────────────────────────────────────
function ProgressBar({ steps, index }) {
  const visible = steps.filter(s => s !== 'welcome' && s !== 'connecting' && s !== 'done')
  const activePos = visible.indexOf(steps[index])
  if (activePos === -1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '20px 0 0' }}>
      {visible.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 26, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: C.mono, fontSize: 11, fontWeight: 700,
            background: i < activePos ? C.blue : 'transparent',
            color: i < activePos ? C.whiteHot : i === activePos ? C.blue : C.muted,
            border: `2px solid ${i <= activePos ? C.blue : C.border}` }}>
            {i < activePos ? '✓' : i + 1}
          </div>
          {i < visible.length - 1 && (
            <div style={{ width: 32, height: 2, background: i < activePos ? C.blue : C.border }} />
          )}
        </div>
      ))}
    </div>
  )
}

// Google's official 4-color "G" mark, inline so the button doesn't depend on
// an external image URL (which the app's CSP would need to allow separately).
function GoogleG({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

// ── Step: Welcome ────────────────────────────────────────────────────────────
function WelcomeStep({ onSignIn, signingIn, error }) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontFamily: C.head, fontSize: 56, letterSpacing: 2, lineHeight: 1 }}>
        <span style={{ color: C.blue }}>Shin</span>Racer
      </div>
      <div style={{ fontSize: 16, color: C.mutedHi }}>Race. Drift. Coordinate.</div>
      <div style={{ fontSize: 13, color: C.muted }}>Built for the crew by the crew.</div>
      <button onClick={onSignIn} disabled={signingIn}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 18,
          background: '#fff', color: '#3c4043', border: '1px solid #dadce0',
          padding: '12px 24px', fontFamily: C.body, fontWeight: 600, fontSize: 16,
          cursor: signingIn ? 'default' : 'pointer', opacity: signingIn ? 0.6 : 1,
        }}>
        <GoogleG /> {signingIn ? 'Opening browser…' : 'Sign in with Google'}
      </button>
      {error && <div style={{ fontSize: 12, color: C.red, maxWidth: 320 }}>{error}</div>}
      <div style={{ fontSize: 12, color: C.muted, maxWidth: 320 }}>You need a Google account to use ShinRacer.</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 44 }}>ShinTech Electronics</div>
    </div>
  )
}

// ── Step: Connecting (automatic) ────────────────────────────────────────────
function ConnectingStep({ status, pendingProfile, error, onRetry, onContinueOffline }) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: 360 }}>
      {pendingProfile?.picture && (
        <img src={pendingProfile.picture} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${C.blue}` }} />
      )}
      <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 1 }}>CONNECTING TO THE CREW</div>
      {status !== 'error' && status !== 'offline-available' && (
        <div style={{ width: '100%', height: 4, background: C.border, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '40%', background: C.blue,
            animation: 'progressSlide 1.1s ease-in-out infinite',
          }} />
          <style>{`@keyframes progressSlide { 0% { left: -40%; } 100% { left: 100%; } }`}</style>
        </div>
      )}
      {(status === 'error' || status === 'offline-available') && (
        <>
          <div style={{ color: C.orange, fontSize: 13 }}>
            {status === 'offline-available' ? 'Backend offline — check Tailscale connection' : `Sign-in failed: ${error}`}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="subtle" onClick={onRetry}>Retry</Btn>
            {status === 'offline-available' && <Btn variant="ghost" onClick={onContinueOffline}>Continue offline</Btn>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Step: Identity ───────────────────────────────────────────────────────────
function IdentityStep({ data, setData, googleUser }) {
  const tooShort = data.handle.length > 0 && data.handle.trim().length < 2
  return (
    <Card style={{ width: 420 }}>
      {googleUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {googleUser.picture && <img src={googleUser.picture} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${C.blue}` }} />}
          <div>
            <div style={{ fontFamily: C.head, fontSize: 16 }}>{googleUser.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{googleUser.email}</div>
          </div>
        </div>
      )}
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>This is how the crew will see you.</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
        Your Google account secures your access. Handle and color are just how you appear in the app.
      </div>

      <Label>Handle</Label>
      <div style={{ marginBottom: 16 }}>
        <TextInput value={data.handle} onChange={v => setData(d => ({ ...d, handle: v }))} placeholder="e.g. yourhandle" />
        {tooShort && <div style={{ fontSize: 11, color: C.orange, marginTop: 4 }}>At least 2 characters</div>}
      </div>

      <Label>Color</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {IDENTITY_COLORS.map(c => (
          <button key={c} onClick={() => setData(d => ({ ...d, color: c }))}
            style={{ width: 24, height: 24, borderRadius: 8, background: c, cursor: 'pointer',
              border: data.color === c ? `2px solid ${C.whiteHot}` : '2px solid transparent',
              boxShadow: data.color === c ? `0 0 0 2px ${c}` : 'none' }} />
        ))}
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
        <span style={{ fontFamily: C.head, color: data.color }}>
          Hello, {data.handle.trim() || '…'}
        </span>
      </div>
    </Card>
  )
}

// ── Step: Backend ────────────────────────────────────────────────────────────
function BackendStep({ data, setData, onSkip, alreadyOnline }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(alreadyOnline ? { ok: true } : null)

  const test = useCallback(async () => {
    setTesting(true)
    setResult(null)
    try {
      const res = await axios.get(`${data.backendUrl}/api/health`, { timeout: 5000 })
      setResult(res.data?.ok ? { ok: true, uptime: res.data.uptime } : { ok: false, error: 'Unexpected response' })
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
    setTesting(false)
  }, [data.backendUrl])

  useEffect(() => {
    if (!alreadyOnline) test()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card style={{ width: 460 }}>
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>Connect to the crew</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>The backend server keeps everyone's events, chat, and stats in sync.</div>

      <Label>Backend URL</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <TextInput value={data.backendUrl} mono style={{ flex: 1 }}
          onChange={v => { setData(d => ({ ...d, backendUrl: v, backendSkipped: false })); setResult(null) }} />
        <Btn size="sm" variant="subtle" onClick={test} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Btn>
      </div>
      {result && (
        result.ok
          ? <div style={{ fontSize: 12, color: C.green, marginBottom: 10 }}>✓ Reachable</div>
          : <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>✕ {result.error}</div>
      )}
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Your host needs to deploy the backend — see README.md</div>
      <button onClick={onSkip}
        style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
        Skip for now
      </button>
    </Card>
  )
}

// ── Step: AC Path (Host/Admin only) ──────────────────────────────────────────
function AcPathStep({ data, setData, valid }) {
  const browseRoot = async () => {
    const p = await api.dialog.openFolder({ title: 'Select Assetto Corsa root folder' })
    if (p) setData(d => ({ ...d, acPath: p, acServerExe: `${p}\\server\\acServer.exe` }))
  }
  const browseExe = async () => {
    const p = await api.dialog.openFile({ title: 'Select acServer.exe', filters: [{ name: 'Executable', extensions: ['exe'] }] })
    if (p) setData(d => ({ ...d, acServerExe: p }))
  }
  return (
    <Card style={{ width: 480 }}>
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>Assetto Corsa</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>We'll use this to find your tracks, cars, and launch servers.</div>

      {valid ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${C.green}18`,
          border: `1px solid ${C.green}60`, borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
          <span style={{ color: C.green }}>✓</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.mutedHi }}>{data.acPath}</span>
        </div>
      ) : (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 8,
          padding: '8px 12px', marginBottom: 16, fontSize: 12, color: C.orange }}>
          Not auto-detected — set path manually.
        </div>
      )}

      <Label>AC root folder</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <TextInput value={data.acPath} onChange={v => setData(d => ({ ...d, acPath: v }))} placeholder="C:\...\assettocorsa" mono />
        <Btn size="sm" variant="subtle" onClick={browseRoot}>Browse</Btn>
      </div>

      <Label>acServer.exe path</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput value={data.acServerExe} onChange={v => setData(d => ({ ...d, acServerExe: v }))} placeholder="…\server\acServer.exe" mono />
        <Btn size="sm" variant="subtle" onClick={browseExe}>Browse</Btn>
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginTop: 16 }}>
        You have Host access — you'll be able to run AC servers from this machine. AC must be installed to host.
      </div>
    </Card>
  )
}

// ── Step: Host Readiness Check (Host/Admin only) ─────────────────────────────
function HostCheckStep({ data, backendOnline, registered, onRegister }) {
  const checks = [
    { label: 'Assetto Corsa found', ok: !!data.acPath },
    { label: 'acServer.exe found', ok: !!data.acServerExe },
    { label: 'Backend reachable', ok: backendOnline },
    { label: 'This machine registered as available host', ok: registered },
  ]
  const allGreen = checks.every(c => c.ok)
  return (
    <Card style={{ width: 440 }}>
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, marginBottom: 14 }}>Host readiness check</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ color: c.ok ? C.green : C.red, fontFamily: C.mono }}>{c.ok ? '✓' : '✗'}</span>
            {c.label}
          </div>
        ))}
      </div>
      {allGreen ? (
        <div style={{ fontFamily: C.head, fontSize: 16, color: C.green, letterSpacing: 1, textAlign: 'center' }}>
          THIS MACHINE IS READY TO HOST
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C.orange, marginBottom: 10 }}>Some checks failed — you can continue anyway and fix these later in Settings.</div>
          {!registered && backendOnline && (
            <Btn size="sm" variant="subtle" onClick={onRegister}>Register this machine</Btn>
          )}
        </>
      )}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 14 }}>You can fix these in Settings later.</div>
    </Card>
  )
}

// ── Step: AI Race Engineer (optional) ────────────────────────────────────────
function AiEngineerStep({ data, setData }) {
  const setAiEngineer = (patch) => setData(d => ({ ...d, aiEngineer: { ...d.aiEngineer, ...patch } }))
  return (
    <Card style={{ width: 520 }}>
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>AI Race Engineer (optional)</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
        A telemetry-aware chat assistant and proactive alerts, powered by your own Claude/OpenAI key or a local
        server. Off by default — skip this and set it up in Settings any time.
      </div>
      <AiEngineerSetup value={data.aiEngineer} onChange={setAiEngineer} />
    </Card>
  )
}

// ── Step: Quick phrases ──────────────────────────────────────────────────────
function PhrasesStep({ data, setData }) {
  const setPhrase = (i, v) => setData(d => ({ ...d, quickPhrases: d.quickPhrases.map((p, idx) => (idx === i ? v : p)) }))
  const reset = () => setData(d => ({ ...d, quickPhrases: [...DEFAULT_QUICK_PHRASES] }))
  return (
    <Card style={{ width: 520 }}>
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>Quick phrases</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>One-tap phrases for the Comms chat. Edit them any time in Settings.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {data.quickPhrases.map((p, i) => <TextInput key={i} value={p} onChange={v => setPhrase(i, v)} />)}
      </div>
      <Btn size="sm" variant="subtle" onClick={reset}>Reset to defaults</Btn>
    </Card>
  )
}

// ── Step: PWA on your phone ──────────────────────────────────────────────────
const PWA_FEATURES = [
  { icon: '📅', label: 'Events', desc: 'See upcoming sessions and accept invites' },
  { icon: '🎙️', label: 'Comms', desc: 'Voice and text chat with the crew' },
  { icon: '📦', label: 'Mods', desc: 'Browse and download the mod library' },
]

function PwaStep({ backendUrl }) {
  const pwaUrl = useMemo(() => getPwaUrl(backendUrl || DEFAULT_BACKEND_URL), [backendUrl])
  const qrSvg = useMemo(() => generateQRSvg(pwaUrl, 200), [pwaUrl])

  return (
    <Card style={{ width: 680 }}>
      <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 1, marginBottom: 4 }}>GET IT ON YOUR PHONE</div>
      <div style={{ fontFamily: C.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>
        ShinRacer runs as an app on iOS and Android. No App Store. No Play Store. 30 seconds to set up.
      </div>

      <div style={{ display: 'flex', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 232, flexShrink: 0 }}>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}
            dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.blue, marginTop: 10, textAlign: 'center', userSelect: 'all', wordBreak: 'break-all' }}>
            {pwaUrl}
          </div>
          <div style={{ fontFamily: C.body, fontSize: 11, color: C.muted, marginTop: 4 }}>Scan with your phone camera</div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: C.head, fontSize: 16, color: C.white, marginBottom: 6 }}>📱 iPhone / iPad</div>
          <ol style={{ fontFamily: C.body, fontSize: 13, lineHeight: 1.6, color: C.mutedHi, margin: '0 0 6px', paddingLeft: 20 }}>
            <li>Open Safari — must be Safari, not Chrome</li>
            <li>Scan the QR code or type the URL above</li>
            <li>Tap the Share button ⬆ at the bottom of the screen</li>
            <li>Tap "Add to Home Screen"</li>
            <li>Tap "Add" — ShinRacer appears on your home screen</li>
          </ol>
          <div style={{ fontFamily: C.body, fontSize: 11, color: C.muted, marginBottom: 16 }}>Chrome on iOS cannot install PWAs.</div>

          <div style={{ fontFamily: C.head, fontSize: 16, color: C.white, marginBottom: 6, marginTop: 16 }}>🤖 Android</div>
          <ol style={{ fontFamily: C.body, fontSize: 13, lineHeight: 1.6, color: C.mutedHi, margin: '0 0 6px', paddingLeft: 20 }}>
            <li>Open Chrome</li>
            <li>Scan the QR code or type the URL above</li>
            <li>Tap the menu ⋮ in the top right</li>
            <li>Tap "Add to Home Screen" or "Install App"</li>
            <li>Tap "Add"</li>
          </ol>
          <div style={{ fontFamily: C.body, fontSize: 11, color: C.muted }}>Works on Chrome, Edge, and most Android browsers.</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        {PWA_FEATURES.map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 16 }}>{f.icon}</span>
            <div style={{ fontFamily: C.body, fontSize: 12, color: C.mutedHi }}>
              <strong style={{ color: C.white }}>{f.label}</strong> — {f.desc}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}40`, borderRadius: 8,
        padding: '12px 16px', marginTop: 16, fontFamily: C.body, fontSize: 13, color: C.blue }}>
        💡 Do it now while you're here — it takes 30 seconds. Check events and jump into comms from your phone before race night.
      </div>
    </Card>
  )
}

// ── Step: Done ────────────────────────────────────────────────────────────────
const ROLE_COPY = {
  crew: 'You can join events, talk to the crew, and download mods. Have fun.',
  host: 'You can host servers, view telemetry, and manage sessions. Get it set up.',
  admin: "You have full access. Don't break anything.",
}
const ROLE_COLOR = { admin: C.red, host: C.blue, crew: C.muted }

function DoneStep({ data, googleUser, role, onFinish }) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {googleUser?.picture && <img src={googleUser.picture} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${C.blue}` }} />}
      <div style={{ fontFamily: C.head, fontSize: 36, letterSpacing: 1 }}>YOU'RE IN, {data.handle.trim() || 'RACER'}.</div>
      <span style={{ fontFamily: C.head, fontSize: 14, letterSpacing: 1, color: ROLE_COLOR[role] || C.muted,
        border: `1px solid ${ROLE_COLOR[role] || C.muted}`, padding: '3px 10px', textTransform: 'uppercase' }}>
        {role}
      </span>
      <div style={{ fontSize: 13, color: C.mutedHi, maxWidth: 340, marginTop: 4 }}>{ROLE_COPY[role] || ROLE_COPY.crew}</div>
      <Btn size="lg" onClick={onFinish} style={{ marginTop: 18 }}>Open ShinRacer →</Btn>
    </div>
  )
}

// ── Wizard root ───────────────────────────────────────────────────────────────
export default function Wizard({ onComplete }) {
  const { signIn, signInStatus, pendingProfile, signInError, continueOffline,
    user, role, isSignedIn, saveIdentity, backendOnline, backendUrl: storeBackendUrl } = useStore()
  const [detecting, setDetecting] = useState(true)
  const [acFound, setAcFound] = useState(false)
  const [acPathValid, setAcPathValid] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [welcomeError, setWelcomeError] = useState(null)
  const [hostRegistered, setHostRegistered] = useState(false)
  const [data, setData] = useState({
    acPath: '', acServerExe: '',
    handle: '', color: C.blue,
    backendUrl: storeBackendUrl || DEFAULT_BACKEND_URL, backendSkipped: false,
    quickPhrases: [...DEFAULT_QUICK_PHRASES],
    aiEngineer: { ...DEFAULT_AI_ENGINEER },
  })

  // Detection: AC root via api.ac.detect(), then confirm acServer.exe itself exists.
  useEffect(() => {
    (async () => {
      const detected = await api.ac.detect()
      let exePath = ''
      let exeExists = false
      if (detected.found) {
        exePath = `${detected.path}\\server\\acServer.exe`
        exeExists = await api.fs.exists(exePath)
      }
      setAcFound(detected.found)
      setAcPathValid(exeExists)
      if (detected.found) {
        setData(d => ({ ...d, acPath: detected.path, acServerExe: exePath }))
      }
      setDetecting(false)
    })()
  }, [])

  // Pre-fill the Identity step from whatever AppStore already defaulted
  // (Google first name / C.blue) the moment sign-in completes.
  useEffect(() => {
    if (user) setData(d => ({ ...d, handle: d.handle || user.name?.split(' ')[0] || '', color: d.color }))
  }, [user])

  // Once sign-in actually completes (AppStore's oauth callback resolved),
  // move off the Connecting step automatically.
  useEffect(() => {
    if (isSignedIn && (stepIdx === 0 || stepIdx === 1)) {
      setStepIdx(steps.indexOf('identity'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  const isHostOrAdmin = role === 'host' || role === 'admin'
  const steps = useMemo(() => {
    const base = ['welcome', 'connecting', 'identity', 'backend']
    if (isHostOrAdmin) base.push('acpath', 'hostcheck')
    base.push('phrases')
    // AI Engineer has no page to set up on ShinRacer Lite (see App.jsx's
    // LITE_VISIBLE) — no point onboarding into a feature with no nav entry.
    if (!isLite) base.push('aiengineer')
    base.push('pwa', 'done')
    return base
  }, [isHostOrAdmin])
  const stepId = steps[stepIdx] || 'welcome'

  // Re-validate the AC paths live as the user edits/browses within the AC Path step.
  useEffect(() => {
    if (stepId !== 'acpath') return
    let cancelled = false
    ;(async () => {
      const rootOk = data.acPath ? await api.fs.exists(`${data.acPath}\\AssettoCorsa.exe`) : false
      const exeOk = data.acServerExe ? await api.fs.exists(data.acServerExe) : false
      if (!cancelled) setAcPathValid(rootOk && exeOk)
    })()
    return () => { cancelled = true }
  }, [stepId, data.acPath, data.acServerExe])

  const goNext = useCallback(() => setStepIdx(i => Math.min(i + 1, steps.length - 1)), [steps.length])
  const goBack = useCallback(() => setStepIdx(i => Math.max(i - 1, 0)), [])

  async function handleSignIn() {
    setSigningIn(true)
    setWelcomeError(null)
    try {
      await signIn()
      setStepIdx(steps.indexOf('connecting'))
    } catch (e) {
      // signIn() itself only fails if the backend can't even build an auth
      // URL (i.e. it's unreachable before the user ever left the app) —
      // surfaced right on the welcome step rather than advancing to a
      // Connecting screen that has nothing to show.
      const msg = e.message || 'Sign in failed — check your connection'
      setWelcomeError(
        msg.includes('redirect_uri_mismatch')
          ? 'OAuth not configured — see docs/GOOGLE_OAUTH_SETUP.md'
          : msg
      )
    }
    setSigningIn(false)
  }

  async function registerAsHost() {
    try {
      const machineName = (await api.system.hostname()) || 'unknown'
      const { data: res } = await httpApi.post('/api/hosts/register', { machineName, acPath: data.acPath })
      if (res.ok) setHostRegistered(true)
    } catch (e) { /* backend unreachable — the checklist already shows this red, nothing more to do here */ }
  }

  const skipBackend = () => {
    setData(d => ({ ...d, backendUrl: DEFAULT_BACKEND_URL, backendSkipped: true }))
    goNext()
  }

  const finish = useCallback(async () => {
    setFinishing(true)
    await saveIdentity({ handle: data.handle.trim(), color: data.color })
    await onComplete({
      settings: { acPath: data.acPath, acServerExe: data.acServerExe, setupComplete: true },
      backendUrl: data.backendUrl,
      quickPhrases: data.quickPhrases,
      aiEngineer: data.aiEngineer,
    })
  }, [data, onComplete, saveIdentity])

  const primaryEnabled = {
    welcome: true, connecting: false, identity: data.handle.trim().length >= 2,
    backend: true, acpath: acPathValid, hostcheck: true, phrases: true, aiengineer: true, pwa: true, done: !finishing,
  }[stepId]
  const primaryAction = {
    welcome: handleSignIn, connecting: () => {}, identity: goNext, backend: goNext,
    acpath: goNext, hostcheck: goNext, phrases: goNext, aiengineer: goNext, pwa: goNext, done: finish,
  }[stepId]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && primaryEnabled && stepId !== 'connecting') primaryAction() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [primaryEnabled, primaryAction, stepId])

  if (detecting) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
        Checking your setup…
      </div>
    )
  }

  const isBookend = stepId === 'welcome' || stepId === 'connecting' || stepId === 'done'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!isBookend && <ProgressBar steps={steps} index={stepIdx} />}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        backgroundImage: isBookend ? GRID_TEXTURE : 'none' }}>
        {stepId === 'welcome' && <WelcomeStep onSignIn={handleSignIn} signingIn={signingIn} error={welcomeError} />}
        {stepId === 'connecting' && (
          <ConnectingStep status={signInStatus} pendingProfile={pendingProfile} error={signInError}
            onRetry={handleSignIn} onContinueOffline={continueOffline} />
        )}
        {stepId === 'identity' && <IdentityStep data={data} setData={setData} googleUser={user} />}
        {stepId === 'backend' && <BackendStep data={data} setData={setData} onSkip={skipBackend} alreadyOnline={backendOnline} />}
        {stepId === 'acpath' && <AcPathStep data={data} setData={setData} valid={acPathValid} />}
        {stepId === 'hostcheck' && (
          <HostCheckStep data={data} backendOnline={backendOnline} registered={hostRegistered} onRegister={registerAsHost} />
        )}
        {stepId === 'phrases' && <PhrasesStep data={data} setData={setData} />}
        {stepId === 'aiengineer' && <AiEngineerStep data={data} setData={setData} />}
        {stepId === 'pwa' && <PwaStep backendUrl={data.backendUrl} />}
        {stepId === 'done' && <DoneStep data={data} googleUser={user} role={role || 'crew'} onFinish={finish} />}
      </div>
      {!isBookend && (
        <div style={{ padding: '18px 32px', display: 'flex', justifyContent: stepId === 'pwa' ? 'space-between' : 'flex-end', gap: 10, borderTop: `1px solid ${C.border}` }}>
          {stepId === 'pwa' ? (
            <>
              <Btn variant="ghost" onClick={goNext}>SKIP — I'll do this later</Btn>
              <Btn onClick={goNext}>DONE — I'm set up</Btn>
            </>
          ) : (
            <>
              <Btn variant="ghost" onClick={goBack}>← Back</Btn>
              <Btn onClick={goNext} disabled={!primaryEnabled}>Next →</Btn>
            </>
          )}
        </div>
      )}
    </div>
  )
}
