import { useState, useEffect, useRef, Fragment } from 'react'
import { C, Card, Btn, Label, TextInput, Select, Toggle, Slider, TabBar, SectionHead, Tag } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { useSocket } from '../hooks/useSocket'
import { useTelemetryShm } from '../hooks/useTelemetryShm'
import { useFpvBroadcast } from '../hooks/useFpvBroadcast'

const api = window.api

const CSP_MAX_VERSION = '0.1.80-preview115'

// ── Controller presets ───────────────────────────────────────────────────────
// William has all five of these; DJI FPV Controller 2 & 3 share an identical
// axis layout in the source spec, so they're one matcher/preset ("dji"), not
// two — there's no way to tell 2 from 3 apart from navigator.getGamepads()'s
// `id` string alone anyway.
const CONTROLLER_MATCHERS = [
  { id: 'tx16s',   label: 'Radiomaster TX16S', re: /TX16S|Radiomaster/i, preset: 'rc' },
  { id: 'tango2',  label: 'TBS Tango 2',        re: /Tango|TBS/i,        preset: 'rc' },
  { id: 'taranis', label: 'FrSky Taranis',      re: /Taranis|FrSky/i,    preset: 'rc' },
  { id: 'dji',     label: 'DJI FPV Controller', re: /DJI FPV/i,          preset: 'dji' },
  { id: 'ds4',     label: 'DualShock 4',        re: /DualShock|Wireless Controller|PS4/i, preset: 'ds4' },
  { id: 'xbox',    label: 'Xbox / Generic gamepad', re: /Xbox|XInput/i,  preset: 'xbox' },
]
function matchController(name) {
  return CONTROLLER_MATCHERS.find(m => m.re.test(name || '')) || null
}

const AXIS_PRESETS = {
  rc: {
    label: 'RC Transmitter (Mode 2)',
    throttleAxis: 1, yawAxis: 0, pitchAxis: 3, rollAxis: 2,
    invertThrottle: true, invertYaw: false, invertPitch: true, invertRoll: false,
    mode3d: false,
  },
  dji: {
    label: 'DJI FPV Controller',
    throttleAxis: 1, yawAxis: 0, pitchAxis: 4, rollAxis: 3,
    invertThrottle: true, invertYaw: false, invertPitch: true, invertRoll: false,
    mode3d: false,
  },
  xbox: {
    label: 'Xbox / generic gamepad',
    throttleAxis: 1, yawAxis: 0, pitchAxis: 4, rollAxis: 3,
    invertThrottle: true, invertYaw: false, invertPitch: true, invertRoll: false,
    mode3d: true,
  },
  ds4: {
    label: 'DualShock 4',
    throttleAxis: 1, yawAxis: 0, pitchAxis: 5, rollAxis: 2,
    invertThrottle: true, invertYaw: false, invertPitch: true, invertRoll: false,
    mode3d: true,
  },
}

const RATE_PRESETS = {
  beginner:  { label: 'Beginner',       rateRoll: 0.5, ratePitch: 0.5, rateYaw: 0.5, superRateRoll: 0.3, superRatePitch: 0.3, superRateYaw: 0.3 },
  freestyle: { label: 'Freestyle',      rateRoll: 0.8, ratePitch: 0.8, rateYaw: 0.8, superRateRoll: 0.5, superRatePitch: 0.5, superRateYaw: 0.5 },
  racing:    { label: 'Racing',         rateRoll: 1.2, ratePitch: 1.2, rateYaw: 1.2, superRateRoll: 0.7, superRatePitch: 0.7, superRateYaw: 0.7 },
  williams:  { label: "William's acro", rateRoll: 1.0, ratePitch: 1.0, rateYaw: 1.0, superRateRoll: 0.6, superRatePitch: 0.6, superRateYaw: 0.6 },
}

const PHYSICS_PRESETS = {
  freestyle5: { label: '5" Freestyle',  motorForce: 20, drag: 0.8, angularDrag: 0.5 },
  micro3:     { label: '3" Micro',      motorForce: 12, drag: 0.5, angularDrag: 0.3 },
  longrange7: { label: '7" Long range', motorForce: 28, drag: 1.2, angularDrag: 0.8 },
  toothpick:  { label: 'Toothpick',     motorForce: 8,  drag: 0.3, angularDrag: 0.2 },
}

// Used for "New preset" when defaultNoInput.json can't be read (mod not
// installed correctly, or that file's been renamed/removed) — a reasonable
// acro-first, RC-transmitter-shaped starting point rather than an error.
const DEFAULT_PRESET_FIELDS = {
  inputDeviceName: '', throttleAxis: 1, yawAxis: 0, pitchAxis: 3, rollAxis: 2,
  invertThrottle: true, invertYaw: false, invertPitch: true, invertRoll: false,
  mode3d: false,
  motorForce: 20, drag: 0.8, angularDrag: 0.5,
  rateRoll: 1.0, ratePitch: 1.0, rateYaw: 1.0,
  superRateRoll: 0.6, superRatePitch: 0.6, superRateYaw: 0.6,
  cameraFov: 120, cameraTilt: 25,
}

// ── Small shared bits ────────────────────────────────────────────────────────

// Non-dismissible, shown on every tab per spec — the single most important
// thing on this whole page.
function CspWarningBanner() {
  return (
    <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}60`, borderRadius: 0, padding: '10px 16px', flexShrink: 0 }}>
      <div style={{ fontFamily: C.head, fontSize: 14, letterSpacing: 1, color: C.red }}>⚠ CSP VERSION WARNING</div>
      <div style={{ fontSize: 12, color: C.textSec, marginTop: 3, lineHeight: 1.5 }}>
        This mod requires CSP 0.1.79 or {CSP_MAX_VERSION} maximum. Newer CSP versions cause drone jitter and stuttering.
        Do <b>NOT</b> update CSP while using the FPV Drone mod.
      </div>
    </div>
  )
}

// Two crossed lines with circles at the ends — a simple inline "drone"
// glyph per the design section, used once as a header accent rather than
// duplicated everywhere the 🚁 emoji already does the job fine.
function DroneGlyph({ size = 22, color = C.blue }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <line x1="3" y1="3" x2="21" y2="21" stroke={color} strokeWidth="1.5" />
      <line x1="21" y1="3" x2="3" y2="21" stroke={color} strokeWidth="1.5" />
      <circle cx="3" cy="3" r="3" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="21" cy="3" r="3" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="3" cy="21" r="3" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="21" cy="21" r="3" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill={color} />
    </svg>
  )
}

function CheckRow({ ok, label, color, children }) {
  const c = color || (ok === null ? C.muted : ok ? C.green : C.red)
  const icon = ok === null ? '•' : ok ? '✓' : '✗'
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 14, textAlign: 'center', color: c, fontFamily: C.head }}>{icon}</span>
        <span style={{ fontSize: 13, color: ok === null ? C.muted : c }}>{label}</span>
      </div>
      {children && <div style={{ marginLeft: 24, marginTop: 8 }}>{children}</div>}
    </div>
  )
}

function Accordion({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div style={{ border: `1px solid ${C.border}`, marginBottom: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: C.head, fontSize: 16, letterSpacing: 0.5, color: C.textPrimary }}>
        {title}
        <span style={{ color: C.muted, fontFamily: C.body }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: '0 14px 16px', fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>{children}</div>}
    </div>
  )
}

// ── SETUP tab ────────────────────────────────────────────────────────────────
function InstallInstructions() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', color: C.blue, fontSize: 11, cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
        {open ? '− Hide install steps' : '+ Show install steps'}
      </button>
      {open && (
        <ol style={{ fontSize: 12, color: C.textSec, marginTop: 8, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Download the zip from Overtake.gg</li>
          <li>Open Content Manager</li>
          <li>Drag the zip into Content Manager</li>
          <li>Click the menu icon (☰) → Install</li>
          <li>Restart AC if running</li>
        </ol>
      )}
    </div>
  )
}

function SetupTab({ onGoMods }) {
  const [checks, setChecks] = useState({ cspFound: false, cspVersion: null, cspCompatible: false, modInstalled: false, acRunning: false })
  const [checking, setChecking] = useState(false)
  const acRunningRef = useRef(false)

  const runChecks = async () => {
    setChecking(true)
    const res = await api.fpv.checkInstall()
    setChecks(res)
    acRunningRef.current = !!res.acRunning
    setChecking(false)
  }

  useEffect(() => {
    runChecks()
    // "every 10s if AC is running" — polling only continues once a session
    // is actually detected, rather than forever re-stat'ing files nobody's
    // waiting on.
    const interval = setInterval(() => { if (acRunningRef.current) runChecks() }, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <DroneGlyph size={30} />
        <div>
          <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 2 }}>FPV DRONE</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>sug44/FpvDroneForAC · Requires CSP ≤ {CSP_MAX_VERSION}</div>
        </div>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CheckRow ok={checks.cspFound} label={checks.cspFound ? 'Custom Shaders Patch found' : 'CSP not found — install from acstuff.ru/patch'}>
          {!checks.cspFound && (
            <Btn size="sm" variant="subtle" onClick={() => api.shell.openExternal('https://acstuff.ru/patch/')}>Open CSP site</Btn>
          )}
        </CheckRow>

        <CheckRow
          ok={!checks.cspFound || checks.cspVersion == null ? null : checks.cspCompatible}
          color={!checks.cspFound || checks.cspVersion == null ? C.muted : checks.cspCompatible ? C.green : C.orange}
          label={
            !checks.cspFound ? 'CSP not installed'
            : checks.cspVersion == null ? 'CSP version unreadable'
            : checks.cspCompatible ? `CSP ${checks.cspVersion} — compatible ✓`
            : `CSP ${checks.cspVersion} — may cause jitter. Use ≤ ${CSP_MAX_VERSION}`
          }
        />

        <CheckRow ok={checks.modInstalled} label={checks.modInstalled ? 'FPV Drone mod installed ✓' : 'Mod not found'}>
          {!checks.modInstalled && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <Btn size="sm" onClick={() => api.shell.openExternal('https://www.overtake.gg/downloads/fpv-drone.51888/')}>Download from Overtake.gg</Btn>
                <Btn size="sm" variant="ghost" onClick={onGoMods}>Install from Mods library</Btn>
              </div>
              <InstallInstructions />
            </div>
          )}
        </CheckRow>

        <CheckRow ok={checks.acRunning} label={checks.acRunning ? 'Assetto Corsa is running ✓' : 'AC not running — start a session to use the drone'} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 0' }}>
          <span style={{ width: 14, textAlign: 'center' }}>•</span>
          <span style={{ fontSize: 13, color: C.muted }}>In-game: move mouse to right edge → click "Fpv Drone" app</span>
        </div>
      </Card>

      <Tooltip text="Re-run every check above">
        <Btn onClick={runChecks} disabled={checking}>{checking ? 'Checking…' : 'Run checks'}</Btn>
      </Tooltip>
    </div>
  )
}

// ── CONTROLLER tab ───────────────────────────────────────────────────────────
function useGamepads(pollMs = 16) {
  const [pads, setPads] = useState([])
  useEffect(() => {
    const interval = setInterval(() => {
      const raw = navigator.getGamepads ? navigator.getGamepads() : []
      const list = []
      for (const p of raw) {
        if (p) list.push({ index: p.index, id: p.id, axes: [...p.axes], buttons: p.buttons.map(b => b.value) })
      }
      setPads(list)
    }, pollMs)
    return () => clearInterval(interval)
  }, [pollMs])
  return pads
}

function AxisBar({ label, value }) {
  const active = Math.abs(value) > 0.1
  const pct = Math.max(-1, Math.min(1, value)) * 50
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ width: 70, fontSize: 11, fontFamily: C.mono, color: active ? C.yellow : C.muted, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: C.border, position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: C.mutedHi }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0,
          left: value < 0 ? `${50 + pct}%` : '50%', width: `${Math.abs(pct)}%`,
          background: active ? C.yellow : C.blue }} />
      </div>
      <span style={{ width: 56, fontSize: 11, fontFamily: C.mono, color: C.textSec, textAlign: 'right', flexShrink: 0 }}>{value.toFixed(3)}</span>
    </div>
  )
}

const AUTO_DETECT_STEPS = ['throttle', 'yaw', 'pitch', 'roll']
const AUTO_DETECT_LABELS = { throttle: 'THROTTLE', yaw: 'YAW', pitch: 'PITCH', roll: 'ROLL' }

function useAxisAutoDetect(axes) {
  const [step, setStep] = useState(null)
  const [detected, setDetected] = useState({})
  const moveStart = useRef({})

  const start = () => { setDetected({}); moveStart.current = {}; setStep('throttle') }
  const cancel = () => setStep(null)

  useEffect(() => {
    if (!step) return
    const interval = setInterval(() => {
      const now = Date.now()
      const taken = new Set(Object.values(detected))
      for (let i = 0; i < axes.length; i++) {
        if (taken.has(i)) continue
        const v = axes[i]
        if (Math.abs(v) > 0.5) {
          if (!moveStart.current[i]) moveStart.current[i] = now
          if (now - moveStart.current[i] > 2000) {
            const next = { ...detected, [step]: i }
            setDetected(next)
            const idx = AUTO_DETECT_STEPS.indexOf(step)
            moveStart.current = {}
            if (idx < AUTO_DETECT_STEPS.length - 1) setStep(AUTO_DETECT_STEPS[idx + 1])
            else setStep(null)
            return
          }
        } else {
          moveStart.current[i] = null
        }
      }
    }, 100)
    return () => clearInterval(interval)
  }, [step, axes, detected])

  return { step, detected, start, cancel }
}

function ControllerTab({ presetData, updateField, updateFields, savePreset, activePreset }) {
  const pads = useGamepads(16)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const pad = pads.find(p => p.index === selectedIndex) || pads[0] || null
  const axes = pad?.axes || []
  const autoDetect = useAxisAutoDetect(axes)

  useEffect(() => {
    if (selectedIndex == null && pads.length) setSelectedIndex(pads[0].index)
  }, [pads, selectedIndex])

  useEffect(() => {
    if (Object.keys(autoDetect.detected).length === 4 && autoDetect.step === null) {
      updateFields({
        throttleAxis: autoDetect.detected.throttle,
        yawAxis: autoDetect.detected.yaw,
        pitchAxis: autoDetect.detected.pitch,
        rollAxis: autoDetect.detected.roll,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect.detected, autoDetect.step])

  if (!presetData) {
    return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>No preset loaded — pick or create one on the Settings tab first.</div>
  }

  const known = matchController(pad?.id)
  const loadPreset = (presetKey) => updateFields(AXIS_PRESETS[presetKey])

  const axisOptions = axes.map((v, i) => ({ value: String(i), label: `Axis ${i} (${v.toFixed(3)})` }))
  const getAxis = (idx, invert) => {
    let v = axes[idx] ?? 0
    if (invert) v = -v
    return v
  }

  return (
    <div style={{ padding: 24, maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionHead children="Connected controllers" sub="Detected via the browser Gamepad API — no native driver needed" />
        {pads.length === 0 ? (
          <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, padding: '14px 16px' }}>
            <div style={{ color: C.orange, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>No controllers detected.</div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 10 }}>
              Plug in your controller before launching AC. Make sure it appears in Windows Game Controllers (Win+R → joy.cpl).
            </div>
            <Btn size="sm" variant="subtle" onClick={() => api.shell.runCommand('control joy.cpl')}>Open joy.cpl</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pads.map(p => {
              const m = matchController(p.id)
              const active = selectedIndex === p.index
              return (
                <Card key={p.index} onClick={() => setSelectedIndex(p.index)}
                  accent={active ? C.blue : m ? C.borderHi : undefined} style={{ padding: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: m ? C.textPrimary : C.muted }}>#{p.index} {m ? m.label : p.id}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.axes.length} axes · {p.buttons.length} buttons</div>
                    </div>
                    {m && <Tag color={C.blue}>{m.label}</Tag>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {known && (
        <Tooltip text={`Load sensible axis defaults for ${known.label}`}>
          <Btn size="sm" onClick={() => loadPreset(known.preset)}>Load {AXIS_PRESETS[known.preset].label} preset</Btn>
        </Tooltip>
      )}

      {pad && (
        <>
          <div>
            <SectionHead children="Live axis monitor" sub="Move each stick to identify which axis index it uses" />
            {axes.map((v, i) => <AxisBar key={i} label={`AXIS ${i}${i === presetData.throttleAxis ? ' THR' : i === presetData.yawAxis ? ' YAW' : i === presetData.pitchAxis ? ' PCH' : i === presetData.rollAxis ? ' ROL' : ''}`} value={v} />)}
          </div>

          <div>
            <SectionHead children="Axis assignment" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><Label>Throttle</Label><Select value={String(presetData.throttleAxis ?? 0)} onChange={v => updateField('throttleAxis', Number(v))} options={axisOptions} /></div>
              <div><Label>Yaw</Label><Select value={String(presetData.yawAxis ?? 0)} onChange={v => updateField('yawAxis', Number(v))} options={axisOptions} /></div>
              <div><Label>Pitch</Label><Select value={String(presetData.pitchAxis ?? 0)} onChange={v => updateField('pitchAxis', Number(v))} options={axisOptions} /></div>
              <div><Label>Roll</Label><Select value={String(presetData.rollAxis ?? 0)} onChange={v => updateField('rollAxis', Number(v))} options={axisOptions} /></div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <Toggle label="Invert throttle" value={!!presetData.invertThrottle} onChange={v => updateField('invertThrottle', v)} />
              <Toggle label="Invert yaw" value={!!presetData.invertYaw} onChange={v => updateField('invertYaw', v)} />
              <Toggle label="Invert pitch" value={!!presetData.invertPitch} onChange={v => updateField('invertPitch', v)} />
              <Toggle label="Invert roll" value={!!presetData.invertRoll} onChange={v => updateField('invertRoll', v)} />
            </div>

            {autoDetect.step ? (
              <div style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}60`, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: C.blue, marginBottom: 6 }}>Move your {AUTO_DETECT_LABELS[autoDetect.step]} stick up and down (or left/right)…</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  Detected: {AUTO_DETECT_STEPS.map(s => `${AUTO_DETECT_LABELS[s]} ${autoDetect.detected[s] != null ? '✓' : '…'}`).join('  ')}
                </div>
                <Btn size="xs" variant="ghost" onClick={autoDetect.cancel} style={{ marginTop: 8 }}>Cancel</Btn>
              </div>
            ) : (
              <Tooltip text="Move each stick in sequence to auto-identify Throttle, Yaw, Pitch, Roll">
                <Btn size="sm" variant="subtle" onClick={autoDetect.start}>Auto-detect axes</Btn>
              </Tooltip>
            )}
          </div>

          <div>
            <SectionHead children="Input preview" sub="What the mod sees after mapping + inversion — should match its own in-game Input Display" />
            <AxisBar label="THR" value={getAxis(presetData.throttleAxis, presetData.invertThrottle)} />
            <AxisBar label="YAW" value={getAxis(presetData.yawAxis, presetData.invertYaw)} />
            <AxisBar label="PCH" value={getAxis(presetData.pitchAxis, presetData.invertPitch)} />
            <AxisBar label="ROL" value={getAxis(presetData.rollAxis, presetData.invertRoll)} />
          </div>
        </>
      )}

      <Card accent={C.borderHi}>
        <SectionHead children="3D Mode (motor reversal)" />
        <Toggle label="3D Mode" value={!!presetData.mode3d} onChange={v => updateField('mode3d', v)}
          hint={presetData.mode3d
            ? 'ON: Lower half of throttle reverses motors. Easier with gamepads. Not how real drones work.'
            : 'OFF (acro): Throttle 0 = motors stop. Realistic FPV behavior. Recommended for acro flying.'} />
      </Card>

      <Tooltip text={activePreset ? `Write these axis settings to "${activePreset}"` : 'Select a preset on the Settings tab first'}>
        <Btn onClick={() => savePreset()} disabled={!activePreset} style={{ alignSelf: 'flex-start' }}>Save to preset</Btn>
      </Tooltip>
    </div>
  )
}

// ── SETTINGS tab ─────────────────────────────────────────────────────────────
function RawJsonEditor({ presetData, onApply }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => { if (open) setText(JSON.stringify(presetData, null, 2)) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    try {
      onApply(JSON.parse(text))
    } catch (e) {
      window.alert(`Invalid JSON: ${e.message}`)
    }
  }
  const copy = () => navigator.clipboard?.writeText(text)

  return (
    <div style={{ border: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', fontFamily: C.head, fontSize: 15, letterSpacing: 0.5, color: C.textPrimary }}>
        Raw JSON editor
        <span style={{ color: C.muted, fontFamily: C.body }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={18} spellCheck={false}
            style={{ width: '100%', fontFamily: C.mono, fontSize: 11, background: C.bg, color: C.textPrimary,
              border: `1px solid ${C.border}`, padding: 10, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn size="sm" onClick={apply}>Apply</Btn>
            <Btn size="sm" variant="ghost" onClick={copy}>Copy JSON</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({
  presets, activePreset, presetData, selectPreset, createPreset, deletePreset,
  updateField, updateFields, replacePresetData, savePreset, autoSave, setAutoSave, dirty,
}) {
  if (!presetData) {
    return (
      <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>
        No presets found under <code>settings/presets/</code> — install the mod first, or click New preset below.
        <div style={{ marginTop: 12 }}><Btn size="sm" onClick={createPreset}>New preset</Btn></div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 12, color: C.muted, background: C.raised, border: `1px solid ${C.border}`, padding: '10px 14px' }}>
        Changes apply when you reload the preset in-game (switch preset and back, or restart the Fpv Drone app). ShinRacer can't hot-reload the Lua mod itself.
      </div>

      <div>
        <SectionHead children="Preset" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Label muted>Active preset</Label>
            <Select value={activePreset || ''} onChange={selectPreset} options={presets.map(p => ({ value: p, label: p }))} />
          </div>
          <Btn size="sm" variant="subtle" onClick={createPreset}>New preset</Btn>
          <Btn size="sm" variant="danger" disabled={!activePreset || activePreset === 'defaultNoInput'} onClick={deletePreset}>Delete preset</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Tooltip text="Write the current settings to the preset file now">
          <Btn onClick={() => savePreset()} disabled={!dirty}>Save preset</Btn>
        </Tooltip>
        <Toggle label="Auto-save" hint="Saves 500ms after every change" value={autoSave} onChange={setAutoSave} />
      </div>

      <Card accent={C.borderHi}>
        <SectionHead children="Flight" />
        <Slider label="Motor force" value={presetData.motorForce ?? 20} min={0} max={50} step={1}
          onChange={v => updateField('motorForce', v)} hint="Higher = faster acceleration. Typical racing: 15-25" />
        <Slider label="Drag" value={presetData.drag ?? 0.8} min={0} max={5} step={0.1}
          onChange={v => updateField('drag', v)} hint="Air resistance. Higher = more stable but slower" />
        <Slider label="Angular drag" value={presetData.angularDrag ?? 0.5} min={0} max={5} step={0.1}
          onChange={v => updateField('angularDrag', v)} hint="Rotation resistance. Higher = less responsive" />

        <Label muted>Physics quick-sets</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {Object.entries(PHYSICS_PRESETS).map(([key, p]) => (
            <Btn key={key} size="xs" variant="ghost" onClick={() => updateFields(p)}>{p.label}</Btn>
          ))}
        </div>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Rates" sub="Betaflight-style rate/expo curves" />
        <Slider label="Rate roll" value={presetData.rateRoll ?? 1} min={0} max={3} step={0.05} onChange={v => updateField('rateRoll', v)} hint="Typical FPV: 0.7-1.2" />
        <Slider label="Rate pitch" value={presetData.ratePitch ?? 1} min={0} max={3} step={0.05} onChange={v => updateField('ratePitch', v)} />
        <Slider label="Rate yaw" value={presetData.rateYaw ?? 1} min={0} max={3} step={0.05} onChange={v => updateField('rateYaw', v)} />
        <Slider label="Super rate roll" value={presetData.superRateRoll ?? 0.5} min={0} max={1} step={0.05} onChange={v => updateField('superRateRoll', v)} hint="Adds expo at stick extremes" />
        <Slider label="Super rate pitch" value={presetData.superRatePitch ?? 0.5} min={0} max={1} step={0.05} onChange={v => updateField('superRatePitch', v)} />
        <Slider label="Super rate yaw" value={presetData.superRateYaw ?? 0.5} min={0} max={1} step={0.05} onChange={v => updateField('superRateYaw', v)} />

        <Label muted>Rate presets</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {Object.entries(RATE_PRESETS).map(([key, p]) => (
            <Btn key={key} size="xs" variant="ghost" onClick={() => updateFields(p)}>{p.label}</Btn>
          ))}
        </div>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Camera" />
        <Slider label="FOV" value={presetData.cameraFov ?? 120} min={60} max={170} step={1}
          onChange={v => updateField('cameraFov', v)} format={v => `${v}°`} hint="Wider = more immersive. Narrower = easier to judge distance" />
        <Slider label="Tilt" value={presetData.cameraTilt ?? 25} min={-30} max={60} step={1}
          onChange={v => updateField('cameraTilt', v)} format={v => `${v}°`} hint="Camera angle. Higher tilt = faster forward flight looks better" />
      </Card>

      <RawJsonEditor presetData={presetData} onApply={replacePresetData} />
    </div>
  )
}

// ── MAP tab ──────────────────────────────────────────────────────────────────
function bearingToCompass(dx, dz) {
  const angle = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(angle / 45) % 8]
}

function computeBounds(points) {
  if (!points.length) return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
  }
  const spanX = Math.max(maxX - minX, 1), spanZ = Math.max(maxZ - minZ, 1)
  const padX = spanX * 0.1, padZ = spanZ * 0.1
  return { minX: minX - padX, maxX: maxX + padX, minZ: minZ - padZ, maxZ: maxZ + padZ }
}

function project(x, z, bounds) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1)
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1)
  const scale = 360 / Math.max(spanX, spanZ)
  return {
    cx: 200 + (x - (bounds.minX + bounds.maxX) / 2) * scale,
    cy: 200 + (z - (bounds.minZ + bounds.maxZ) / 2) * scale,
  }
}

function MapTab({ identity }) {
  const { socket, users } = useSocket(identity)
  const { frame, isDemo } = useTelemetryShm()
  useFpvBroadcast({ socket, identity, frame, isDemo })

  const [remote, setRemote] = useState({}) // handle -> { x, y, z, track, lastSeen }
  const [droneMode, setDroneMode] = useState(false)
  const [chaseTarget, setChaseTarget] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [autoFollow, setAutoFollow] = useState(true)
  const [mapImage, setMapImage] = useState(null)

  useEffect(() => {
    if (!socket) return
    const onPos = (data) => {
      if (data.handle === identity?.handle) return
      setRemote(prev => ({ ...prev, [data.handle]: { x: data.x, y: data.y, z: data.z, track: data.track, lastSeen: Date.now() } }))
    }
    socket.on('fpv:position', onPos)
    return () => socket.off('fpv:position', onPos)
  }, [socket, identity?.handle])

  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 2000
      setRemote(prev => {
        const next = {}
        let changed = false
        for (const [h, p] of Object.entries(prev)) {
          if (p.lastSeen >= cutoff) next[h] = p
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setMapImage(null)
    if (!frame?.track || isDemo) return
    api.fpv.readMapImage(frame.track).then(res => { if (res.ok) setMapImage(`data:image/png;base64,${res.base64}`) })
  }, [frame?.track, isDemo])

  const localPos = !isDemo && frame?.worldPosition && frame.worldPosition.x != null ? frame.worldPosition : null
  const inSession = !!localPos

  const withMeta = Object.entries(remote).map(([handle, p]) => {
    const color = users.find(u => u.handle === handle)?.color || C.mutedHi
    if (!localPos) return { handle, ...p, color, distance: null, bearing: null, angle: null }
    const dx = p.x - localPos.x, dz = p.z - localPos.z
    return { handle, ...p, color, distance: Math.sqrt(dx * dx + dz * dz), bearing: bearingToCompass(dx, dz), angle: (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360 }
  }).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))

  // Auto-chase nearest while in drone mode, unless the current target's still present.
  useEffect(() => {
    if (!droneMode) { setChaseTarget(null); return }
    if (chaseTarget && withMeta.some(p => p.handle === chaseTarget)) return
    setChaseTarget(withMeta[0]?.handle || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droneMode, withMeta.map(p => p.handle).join(',')])

  const allPoints = [...(localPos ? [{ x: localPos.x, z: localPos.z }] : []), ...withMeta.map(p => ({ x: p.x, z: p.z }))]
  const bounds = autoFollow && localPos
    ? { minX: localPos.x - 60, maxX: localPos.x + 60, minZ: localPos.z - 60, maxZ: localPos.z + 60 }
    : computeBounds(allPoints)

  const chaseInfo = chaseTarget ? withMeta.find(p => p.handle === chaseTarget) : null

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <SectionHead children="Chase map" sub="Every ShinRacer client broadcasts its own position — AC's shared memory only exposes yours" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Toggle label="Drone mode" value={droneMode} onChange={setDroneMode} />
          <Toggle label="Auto-follow" value={autoFollow} onChange={setAutoFollow} />
        </div>
      </div>

      {droneMode && chaseInfo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tag color={C.blue}>Chasing: {chaseInfo.handle}</Tag>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.textSec }}>
            {chaseInfo.distance?.toFixed(0)}m · {chaseInfo.bearing}
            <span style={{ display: 'inline-block', marginLeft: 6, transform: `rotate(${chaseInfo.angle}deg)` }}>↑</span>
          </span>
        </div>
      )}

      <div style={{ position: 'relative', width: '100%', height: 420, background: C.bg, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <svg viewBox="0 0 400 400" width="100%" height="100%" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
          {mapImage ? (
            <image href={mapImage} x="0" y="0" width="400" height="400" opacity={0.5} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <g stroke={C.border} strokeWidth="0.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <Fragment key={i}>
                  <line x1={i * 50} y1={0} x2={i * 50} y2={400} />
                  <line x1={0} y1={i * 50} x2={400} y2={i * 50} />
                </Fragment>
              ))}
            </g>
          )}

          {withMeta.map(p => {
            const { cx, cy } = project(p.x, p.z, bounds)
            const isChase = chaseTarget === p.handle
            return (
              <g key={p.handle}>
                <circle cx={cx} cy={cy} r={6} fill={p.color} stroke={isChase ? C.blue : 'none'} strokeWidth={isChase ? 2 : 0} />
                <text x={cx} y={cy - 10} fontSize="8" fill={C.textPrimary} textAnchor="middle" fontFamily={C.body}>{p.handle}</text>
              </g>
            )
          })}

          {localPos && (() => {
            const { cx, cy } = project(localPos.x, localPos.z, bounds)
            return droneMode ? (
              <text x={cx} y={cy + 5} fontSize="18" fill={C.blue} textAnchor="middle">✦</text>
            ) : (
              <g>
                <circle cx={cx} cy={cy} r={8} fill={C.yellow} />
                <text x={cx} y={cy - 12} fontSize="9" fill={C.yellow} textAnchor="middle" fontWeight="bold">YOU</text>
              </g>
            )
          })()}
        </svg>

        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Btn size="xs" variant="subtle" onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))}>+</Btn>
          <Btn size="xs" variant="subtle" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(1)))}>−</Btn>
          <Btn size="xs" variant="subtle" onClick={() => { setZoom(1); setAutoFollow(false) }}>Reset</Btn>
        </div>
      </div>

      {!inSession ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Start a session to see positions</div>
      ) : withMeta.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No other crew broadcasting positions right now</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {withMeta.map(p => (
            <Card key={p.handle} accent={chaseTarget === p.handle ? C.blue : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.handle}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>x:{p.x.toFixed(1)} z:{p.z.toFixed(1)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: C.mono, fontSize: 13, color: C.blue }}>{p.distance != null ? `${p.distance.toFixed(0)}m` : '—'}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{p.bearing || '—'}</div>
              </div>
              <Btn size="xs" variant={chaseTarget === p.handle ? 'primary' : 'ghost'} onClick={() => setChaseTarget(p.handle)}>Chase</Btn>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── GUIDE tab ────────────────────────────────────────────────────────────────
function GuideTab() {
  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <Accordion title="Getting started with acro mode" defaultOpen>
        <p style={{ marginBottom: 10 }}>Acro (manual) mode means the drone does exactly what you input. No self-levelling. If you let go of sticks, it keeps rotating.</p>
        <ul style={{ paddingLeft: 18, marginBottom: 10, lineHeight: 1.8 }}>
          <li><b>Throttle</b> — controls motor speed (up = faster)</li>
          <li><b>Yaw</b> — rotates left/right (nose direction)</li>
          <li><b>Pitch</b> — tilts forward/back (controls forward speed in acro)</li>
          <li><b>Roll</b> — tilts left/right (barrel rolls)</li>
        </ul>
        <p>Tip: Start with low rates and high drag until you get the feel.<br />
          Tip: Hover practice first — maintain altitude while barely moving.<br />
          Tip: Small inputs. Acro is very sensitive.</p>
      </Accordion>

      <Accordion title="Controller setup for RC transmitters">
        <p style={{ marginBottom: 10 }}>Your TX16S, Tango, Taranis etc. in HID joystick mode:</p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Bind your transmitter to a receiver OR use USB direct mode</li>
          <li>EdgeTX/OpenTX: enable "USB Joystick" mode in System settings</li>
          <li>The stick channels map to axes — use the Live Axis Monitor to identify which axis is which</li>
          <li>Mode 2: Left stick = Throttle (up/down) + Yaw (left/right); Right stick = Pitch (up/down) + Roll (left/right)</li>
          <li>Typically: invert Throttle and Pitch axes</li>
        </ul>
      </Accordion>

      <Accordion title="DJI FPV Controller 2 & 3">
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Plug in via USB. Should be detected automatically.</li>
          <li>Use the DJI FPV preset in the Controller tab.</li>
          <li>The motion controller/gyro features won't work in AC.</li>
          <li>Buttons can be mapped to keybinds in the mod's Keybinds tab.</li>
        </ul>
      </Accordion>

      <Accordion title="Keybinds reference">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 0', color: C.muted, fontWeight: 600 }}>Action</th>
              <th style={{ textAlign: 'left', padding: '6px 0', color: C.muted, fontWeight: 600 }}>Default key</th>
            </tr>
          </thead>
          <tbody>
            {[['Toggle drone', 'K'], ['Reset position', 'R'], ['Next camera', 'C'], ['(others vary)', '—']].map(([a, k]) => (
              <tr key={a} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 0' }}>{a}</td>
                <td style={{ padding: '6px 0', fontFamily: C.mono, color: C.blue }}>{k}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 10 }}>Note: Set keybinds in the FPV Drone app's Keybinds tab in-game.</p>
      </Accordion>

      <Accordion title="CSP version warning (expanded)">
        <p style={{ marginBottom: 10 }}>
          CSP versions above <b>{CSP_MAX_VERSION}</b> cause visible jitter and stuttering in the FPV Drone mod's flight
          physics. Stick to CSP 0.1.79 or {CSP_MAX_VERSION} maximum while flying.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" variant="subtle" onClick={() => api.shell.openExternal('https://acstuff.ru/patch/')}>Compatible CSP versions</Btn>
          <Btn size="sm" variant="ghost" onClick={() => api.shell.openExternal('https://github.com/sug44/FpvDroneForAC/issues')}>Mod's GitHub issues</Btn>
        </div>
        <p style={{ marginTop: 10 }}>If you must use a newer CSP, check the mod's GitHub for updates.</p>
      </Accordion>

      <Accordion title="Recommended settings for chasing cars">
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Camera tilt: 20-30° (moderate forward lean)</li>
          <li>Motor force: 20-25 (fast enough to keep up with cars)</li>
          <li>Rates: Racing preset</li>
          <li>3D mode: OFF</li>
        </ul>
        <p style={{ marginTop: 10 }}>Enable ghost/AI cars in the server to have targets to chase without needing other players online.</p>
      </Accordion>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function FpvView({ onGoMods }) {
  const { identity, showToast } = useStore()
  const [tab, setTab] = useState('setup')
  const [presets, setPresets] = useState([])
  const [activePreset, setActivePresetState] = useState(null)
  const [presetData, setPresetData] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [autoSave, setAutoSave] = useState(false)
  const autoSaveTimer = useRef(null)

  const refreshPresets = async () => {
    const res = await api.fpv.readPresets()
    if (res.ok) setPresets(res.presets)
    return res.ok ? res.presets : []
  }

  const selectPreset = async (name) => {
    if (!name) return
    const res = await api.fpv.readPreset(name)
    if (res.ok) {
      setActivePresetState(name)
      setPresetData(res.data)
      setDirty(false)
    } else {
      showToast(`✕ ${res.error}`, C.red)
    }
  }

  useEffect(() => {
    (async () => {
      const list = await refreshPresets()
      if (list.length) await selectPreset(list[0])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateField = (key, value) => { setPresetData(prev => ({ ...prev, [key]: value })); setDirty(true) }
  const updateFields = (patch) => { setPresetData(prev => ({ ...prev, ...patch })); setDirty(true) }
  const replacePresetData = (data) => { setPresetData(data); setDirty(true) }

  const savePreset = async (dataOverride) => {
    if (!activePreset) return
    const data = dataOverride || presetData
    const res = await api.fpv.writePreset(activePreset, data)
    if (res.ok) { setDirty(false); showToast(`✓ Saved ${activePreset}`) }
    else showToast(`✕ ${res.error}`, C.red)
  }

  // Auto-save: debounced 500ms after the last edit.
  useEffect(() => {
    if (!autoSave || !dirty) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => savePreset(), 500)
    return () => clearTimeout(autoSaveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetData, autoSave, dirty])

  const createPreset = async () => {
    const name = window.prompt('New preset name:')
    if (!name) return
    const base = await api.fpv.readPreset('defaultNoInput')
    const data = base.ok ? base.data : { ...DEFAULT_PRESET_FIELDS }
    const res = await api.fpv.writePreset(name, data)
    if (res.ok) {
      await refreshPresets()
      await selectPreset(name)
      showToast(`✓ Created ${name}`)
    } else {
      showToast(`✕ ${res.error}`, C.red)
    }
  }

  const deletePreset = async () => {
    if (!activePreset || activePreset === 'defaultNoInput') return
    if (!window.confirm(`Delete preset "${activePreset}"?`)) return
    const res = await api.fpv.deletePreset(activePreset)
    if (res.ok) {
      showToast(`✓ Deleted ${activePreset}`)
      const list = await refreshPresets()
      setActivePresetState(null)
      setPresetData(null)
      if (list.length) await selectPreset(list[0])
    } else {
      showToast(`✕ ${res.error}`, C.red)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CspWarningBanner />
      <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
        <TabBar tabs={[
          { id: 'setup', label: 'Setup' },
          { id: 'controller', label: 'Controller' },
          { id: 'settings', label: 'Settings' },
          { id: 'map', label: 'Map' },
          { id: 'guide', label: 'Guide' },
        ]} active={tab} onChange={setTab} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'setup' && <SetupTab onGoMods={onGoMods} />}
        {tab === 'controller' && (
          <ControllerTab presetData={presetData} updateField={updateField} updateFields={updateFields}
            savePreset={savePreset} activePreset={activePreset} />
        )}
        {tab === 'settings' && (
          <SettingsTab presets={presets} activePreset={activePreset} presetData={presetData}
            selectPreset={selectPreset} createPreset={createPreset} deletePreset={deletePreset}
            updateField={updateField} updateFields={updateFields} replacePresetData={replacePresetData}
            savePreset={savePreset} autoSave={autoSave} setAutoSave={setAutoSave} dirty={dirty} />
        )}
        {tab === 'map' && <MapTab identity={identity} />}
        {tab === 'guide' && <GuideTab />}
      </div>
    </div>
  )
}
