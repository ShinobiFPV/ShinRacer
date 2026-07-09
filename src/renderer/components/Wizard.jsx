import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { C, Card, Label, Btn, TextInput } from './primitives'
import { DEFAULT_QUICK_PHRASES, DEFAULT_BACKEND_URL } from '../store/AppStore'

const api = window.api
const IDENTITY_COLORS = [C.yellow, C.blue, C.green, C.red, C.orange, C.purple, C.white, C.mutedHi]

// ── Progress indicator ──────────────────────────────────────────────────────
function ProgressBar({ steps, index }) {
  const visible = steps.filter(s => s !== 'welcome' && s !== 'done')
  const activePos = visible.indexOf(steps[index])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '20px 0 0' }}>
      {visible.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: C.mono, fontSize: 11, fontWeight: 700,
            background: i < activePos ? C.yellow : 'transparent',
            color: i < activePos ? '#000' : i === activePos ? C.yellow : C.muted,
            border: `2px solid ${i <= activePos ? C.yellow : C.border}` }}>
            {i < activePos ? '✓' : i + 1}
          </div>
          {i < visible.length - 1 && (
            <div style={{ width: 32, height: 2, background: i < activePos ? C.yellow : C.border }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step: Welcome ────────────────────────────────────────────────────────────
function WelcomeStep({ onNext }) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 56, letterSpacing: 0.5, lineHeight: 1 }}>
        <span style={{ color: C.yellow }}>Shin</span>Racer
      </div>
      <div style={{ fontSize: 16, color: C.mutedHi }}>Race. Drift. Coordinate.</div>
      <Btn size="lg" onClick={onNext} style={{ marginTop: 18 }}>Get started →</Btn>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 44 }}>ShinTech Electronics</div>
    </div>
  )
}

// ── Step: AC Path ────────────────────────────────────────────────────────────
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
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Assetto Corsa</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>We'll use this to find your tracks, cars, and launch servers.</div>

      {valid ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${C.green}18`,
          border: `1px solid ${C.green}60`, borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
          <span style={{ color: C.green }}>✓</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.mutedHi }}>{data.acPath}</span>
        </div>
      ) : (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 6,
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
    </Card>
  )
}

// ── Step: Identity ───────────────────────────────────────────────────────────
function IdentityStep({ data, setData }) {
  const tooShort = data.handle.length > 0 && data.handle.trim().length < 2
  return (
    <Card style={{ width: 420 }}>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Who are you?</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>Your handle and color appear in Events, Comms, and Lap Stats.</div>

      <Label>Handle</Label>
      <div style={{ marginBottom: 16 }}>
        <TextInput value={data.handle} onChange={v => setData(d => ({ ...d, handle: v }))} placeholder="e.g. shinobi" />
        {tooShort && <div style={{ fontSize: 11, color: C.orange, marginTop: 4 }}>At least 2 characters</div>}
      </div>

      <Label>Color</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {IDENTITY_COLORS.map(c => (
          <button key={c} onClick={() => setData(d => ({ ...d, color: c }))}
            style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
              border: data.color === c ? `2px solid ${C.white}` : '2px solid transparent',
              boxShadow: data.color === c ? `0 0 0 2px ${c}` : 'none' }} />
        ))}
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px' }}>
        <span style={{ fontFamily: C.head, fontWeight: 700, color: data.color }}>
          Hello, {data.handle.trim() || '…'}
        </span>
      </div>
    </Card>
  )
}

// ── Step: Backend ────────────────────────────────────────────────────────────
function BackendStep({ data, setData, onSkip }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      const res = await axios.get(`${data.backendUrl}/api/health`, { timeout: 5000 })
      setResult(res.data?.ok ? { ok: true, uptime: res.data.uptime } : { ok: false, error: 'Unexpected response' })
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
    setTesting(false)
  }

  // Pre-filled from the build's embedded backend URL — auto-test on mount so
  // crew members on Tailscale/LAN see green immediately with no extra click.
  useEffect(() => {
    test()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card style={{ width: 460 }}>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Connect to the crew</div>
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

// ── Step: Quick phrases ──────────────────────────────────────────────────────
function PhrasesStep({ data, setData }) {
  const setPhrase = (i, v) => setData(d => ({ ...d, quickPhrases: d.quickPhrases.map((p, idx) => (idx === i ? v : p)) }))
  const reset = () => setData(d => ({ ...d, quickPhrases: [...DEFAULT_QUICK_PHRASES] }))
  return (
    <Card style={{ width: 520 }}>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Quick phrases</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>One-tap phrases for the Comms chat. Edit them any time in Settings.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {data.quickPhrases.map((p, i) => <TextInput key={i} value={p} onChange={v => setPhrase(i, v)} />)}
      </div>
      <Btn size="sm" variant="subtle" onClick={reset}>Reset to defaults</Btn>
    </Card>
  )
}

// ── Step: Done ────────────────────────────────────────────────────────────────
function DoneStep({ data, acFound, onFinish }) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 52, color: C.green }}>✓</div>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 26 }}>You're all set, {data.handle.trim() || 'racer'}!</div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 22px',
        textAlign: 'left', minWidth: 340, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        <div>
          <span style={{ color: C.muted }}>AC: </span>
          {acFound
            ? <span style={{ fontFamily: C.mono }}>{data.acPath}</span>
            : <span style={{ color: C.orange }}>Server features disabled</span>}
        </div>
        <div>
          <span style={{ color: C.muted }}>Backend: </span>
          {data.backendSkipped
            ? <span style={{ color: C.orange }}>Not connected</span>
            : <span style={{ fontFamily: C.mono }}>{data.backendUrl}</span>}
        </div>
        <div>
          <span style={{ color: C.muted }}>Identity: </span>
          <span style={{ color: data.color, fontWeight: 700 }}>{data.handle.trim()}</span>
        </div>
      </div>
      {!acFound && (
        <div style={{ fontSize: 12, color: C.orange, marginTop: 2, maxWidth: 340 }}>
          Server features disabled — AC server not found on this machine.
        </div>
      )}
      <Btn size="lg" onClick={onFinish} style={{ marginTop: 18 }}>Open ShinRacer →</Btn>
    </div>
  )
}

// ── Wizard root ───────────────────────────────────────────────────────────────
export default function Wizard({ onComplete }) {
  const [detecting, setDetecting] = useState(true)
  const [acFound, setAcFound] = useState(false)
  const [acPathValid, setAcPathValid] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [data, setData] = useState({
    acPath: '', acServerExe: '',
    handle: '', color: C.yellow,
    backendUrl: DEFAULT_BACKEND_URL, backendSkipped: false,
    quickPhrases: [...DEFAULT_QUICK_PHRASES],
  })

  // Detection: AC root via api.ac.detect(), then confirm acServer.exe itself exists —
  // in a standard Steam install the two are found together, so this also decides the
  // step count ("AC server found" = AC root found; the exe check separately drives the
  // AC Path step's own badge/validation, since a base install without the dedicated
  // server component is a real, if rare, case worth surfacing there instead of silently
  // dropping the whole step).
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

  const steps = useMemo(() => (
    acFound
      ? ['welcome', 'acpath', 'identity', 'backend', 'phrases', 'done']
      : ['welcome', 'identity', 'backend', 'done']
  ), [acFound])
  const stepId = steps[stepIdx]

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

  const skipBackend = () => {
    setData(d => ({ ...d, backendUrl: DEFAULT_BACKEND_URL, backendSkipped: true }))
    goNext()
  }

  const finish = useCallback(async () => {
    setFinishing(true)
    await onComplete({
      settings: { acPath: data.acPath, acServerExe: data.acServerExe, setupComplete: true },
      identity: { handle: data.handle.trim(), color: data.color },
      backendUrl: data.backendUrl,
      quickPhrases: data.quickPhrases,
    })
  }, [data, onComplete])

  const primaryEnabled = {
    welcome: true, acpath: acPathValid, identity: data.handle.trim().length >= 2,
    backend: true, phrases: true, done: !finishing,
  }[stepId]
  const primaryAction = {
    welcome: goNext, acpath: goNext, identity: goNext, backend: goNext, phrases: goNext, done: finish,
  }[stepId]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && primaryEnabled) primaryAction() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [primaryEnabled, primaryAction])

  if (detecting) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
        Checking your setup…
      </div>
    )
  }

  const isBookend = stepId === 'welcome' || stepId === 'done'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!isBookend && <ProgressBar steps={steps} index={stepIdx} />}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {stepId === 'welcome' && <WelcomeStep onNext={goNext} />}
        {stepId === 'acpath' && <AcPathStep data={data} setData={setData} valid={acPathValid} />}
        {stepId === 'identity' && <IdentityStep data={data} setData={setData} />}
        {stepId === 'backend' && <BackendStep data={data} setData={setData} onSkip={skipBackend} />}
        {stepId === 'phrases' && <PhrasesStep data={data} setData={setData} />}
        {stepId === 'done' && <DoneStep data={data} acFound={acFound} onFinish={finish} />}
      </div>
      {!isBookend && (
        <div style={{ padding: '18px 32px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: `1px solid ${C.border}` }}>
          <Btn variant="ghost" onClick={goBack}>← Back</Btn>
          <Btn onClick={goNext} disabled={!primaryEnabled}>Next →</Btn>
        </div>
      )}
    </div>
  )
}
