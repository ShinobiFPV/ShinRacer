import { useState, useEffect, useMemo } from 'react'
import { C, Btn, TextInput, Tag, Label, Toggle } from './primitives'
import Tooltip from './Tooltip'
import { useStore } from '../store/AppStore'
import { defaultCfg, WEATHERS, TIMES } from '../views/BuildView'

const api = window.api
const TOTAL_STEPS = 6

const STEP_NAMES = [
  'What are we doing tonight?', 'Pick a track', 'Pick your cars',
  'Conditions', 'Rules & limits', 'Ready to rip',
]

const SESSION_TYPES = [
  { id: 'race',   emoji: '🏁', label: 'Race Night',       tagline: 'Structured sessions. Qualifying. Podium fights.' },
  { id: 'drift',  emoji: '🌀', label: 'Drift Session',     tagline: 'No rules. Just angle.' },
  { id: 'hotlap', emoji: '⏱', label: 'Hotlap Practice',    tagline: 'Chase the perfect lap. Alone or with friends.' },
  { id: 'cruise', emoji: '🚗', label: 'Cruise',            tagline: 'Shut your brain off. Just drive.' },
]

const TRACK_SUBTITLE = {
  race: "Home straight or hairpin, your call.",
  drift: "Somewhere with walls to... not hit.",
  hotlap: "Your battlefield.",
  cruise: "Somewhere scenic. Take your time.",
}
const CARS_SUBTITLE = {
  race: "Keep it fair. Or don't — we're not the FIA.",
  drift: "Anything RWD. Bonus points for style.",
  hotlap: "One car. Maximum focus.",
  cruise: "Whatever fits the vibe.",
}
const RULES_SUBTITLE = {
  race: "Gentleman's agreement. Mostly.",
  drift: "There are no rules. But here are some anyway.",
  hotlap: "Solo mode. Pure and unfiltered.",
  cruise: "Be cool.",
}
const CONDITIONS_DEFAULTS = {
  race:   { weather: 'Clear', time: 'Morning (9:00)' },
  drift:  { weather: 'Clear', time: 'Night (21:00)' },
  hotlap: { weather: 'Clear', time: 'Midday (12:00)' },
  cruise: { weather: 'Partly Cloudy', time: 'Afternoon (15:00)' },
}
const AIDS_DEFAULTS = {
  race:   { tc: false, abs: false, stability: false, autoclutch: false },
  drift:  { tc: false, abs: false, stability: false, autoclutch: true },
  hotlap: { tc: true,  abs: true,  stability: false, autoclutch: false },
  cruise: { tc: true,  abs: true,  stability: true,  autoclutch: true },
}

const WEATHER_OPTIONS = [
  { value: WEATHERS[0], icon: '☀️', label: 'Clear' },
  { value: WEATHERS[1], icon: '⛅', label: 'Partly Cloudy' },
  { value: WEATHERS[2], icon: '☁️', label: 'Overcast' },
  { value: WEATHERS[3], icon: '🌧️', label: 'Light Rain' },
  { value: WEATHERS[4], icon: '⛈️', label: 'Heavy Rain' },
  { value: WEATHERS[5], icon: '🌫️', label: 'Foggy' },
]
const TIME_OPTIONS = [
  { value: TIMES[0], icon: '🌅', label: 'Dawn',      gradient: 'linear-gradient(135deg, #1a0a2e, #ff6b35)' },
  { value: TIMES[1], icon: '🌄', label: 'Morning',   gradient: 'linear-gradient(135deg, #0d1117, #4a9eff)' },
  { value: TIMES[2], icon: '☀️', label: 'Midday',    gradient: 'linear-gradient(135deg, #0d1b2a, #87ceeb)' },
  { value: TIMES[3], icon: '🌇', label: 'Afternoon', gradient: 'linear-gradient(135deg, #0d1117, #ff8c42)' },
  { value: TIMES[4], icon: '🌆', label: 'Dusk',      gradient: 'linear-gradient(135deg, #0a0a1a, #ff4500)' },
  { value: TIMES[5], icon: '🌙', label: 'Night',     gradient: 'linear-gradient(135deg, #000005, #1a1a2e)' },
]

function driverCountLabel(n) {
  if (n <= 4) return 'Just the boys'
  if (n <= 8) return 'Solid group'
  if (n <= 16) return 'Full grid energy'
  return 'This is a lot of people'
}

// ── Shared step chrome: emoji header, name, subtitle, left-aligned content ────
function StepShell({ emoji, name, subtitle, children }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 60, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontFamily: C.head, fontSize: 32, letterSpacing: 2, marginBottom: 6 }}>{name}</div>
      <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>{subtitle}</div>
      <div style={{ textAlign: 'left' }}>{children}</div>
    </div>
  )
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
function SessionTypeStep({ value, onSelect }) {
  return (
    <StepShell emoji="🏎️" name="What are we doing tonight?" subtitle="Pick your poison.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {SESSION_TYPES.map(t => (
          <button key={t.id} onClick={() => onSelect(t.id)}
            style={{ background: value === t.id ? C.overlay : C.raised,
              border: `1px solid ${C.border}`, borderLeft: `3px solid ${value === t.id ? C.blue : C.border}`,
              borderRadius: 0, padding: 20, cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{t.emoji}</div>
            <div style={{ fontFamily: C.head, fontSize: 18, marginBottom: 4, color: C.textPrimary }}>{t.label}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{t.tagline}</div>
          </button>
        ))}
      </div>
    </StepShell>
  )
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
function TrackStep({ acPath, subtitle, value, onSelect, onGoSettings }) {
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!acPath) return
    setLoading(true)
    api.ac.scanTracks(acPath).then(res => { setTracks(res.tracks || []); setLoading(false) })
  }, [acPath])

  const filtered = tracks.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <StepShell emoji="🗺️" name="Pick a track" subtitle={subtitle}>
      {!acPath ? (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 0,
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: C.orange, fontSize: 13, flex: 1 }}>Set your AC path in Settings to browse tracks</span>
          <Btn size="sm" variant="subtle" onClick={onGoSettings}>Go to Settings</Btn>
        </div>
      ) : (
        <>
          <Tooltip text="Filter your installed tracks by name">
            <TextInput value={filter} onChange={setFilter} placeholder="Search your tracks…" />
          </Tooltip>
          {loading && <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Scanning…</div>}
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(t => (
              <button key={t.name} onClick={() => onSelect(t)}
                style={{ background: value?.name === t.name ? `${C.blue}12` : C.raised,
                  border: `1px solid ${value?.name === t.name ? C.blue : C.border}`, borderRadius: 0,
                  padding: '10px 14px', textAlign: 'left', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.textPrimary }}>{t.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {t.hasTraffic && <Tag color={C.green} size="xs">traffic</Tag>}
                  {t.layouts.length > 1 && <Tag color={C.muted} size="xs">{t.layouts.length} layouts</Tag>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </StepShell>
  )
}

// ── Step 3 ──────────────────────────────────────────────────────────────────
function CarsStep({ acPath, subtitle, sessionType, selected, onChange }) {
  const [cars, setCars] = useState([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!acPath) return
    api.fs.readDir(`${acPath}\\content\\cars`).then(res => { if (res.ok) setCars(res.files) })
  }, [acPath])

  const toggle = (car) => onChange(selected.includes(car) ? selected.filter(c => c !== car) : [...selected, car])

  const filtered = useMemo(() => {
    let list = cars.filter(c => c.toLowerCase().includes(filter.toLowerCase()))
    if (sessionType === 'drift') {
      list = [...list].sort((a, b) => Number(b.toLowerCase().includes('drift')) - Number(a.toLowerCase().includes('drift')))
    }
    return list
  }, [cars, filter, sessionType])

  return (
    <StepShell emoji="🚗" name="Pick your cars" subtitle={subtitle}>
      {!acPath ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>Set AC path in Settings to browse cars</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Tooltip text="Filter your installed cars by name">
              <TextInput value={filter} onChange={setFilter} placeholder="Search cars…" style={{ flex: 1, marginRight: 8 }} />
            </Tooltip>
            <Tag color={C.blue}>{selected.length} selected</Tag>
          </div>
          {sessionType === 'hotlap' && (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Single car recommended for clean practice</div>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(car => (
              <Tooltip key={car} text="Select which car models players can choose from">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 0,
                  background: selected.includes(car) ? `${C.blue}12` : C.raised,
                  border: `1px solid ${selected.includes(car) ? C.blueDim : C.border}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.includes(car)} onChange={() => toggle(car)} />
                  <span style={{ fontFamily: C.mono, fontSize: 11 }}>{car}</span>
                </label>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </StepShell>
  )
}

// ── Step 4 ──────────────────────────────────────────────────────────────────
function ConditionsStep({ weather, timeOfDay, onWeather, onTime }) {
  return (
    <StepShell emoji="🌅" name="Conditions" subtitle="Atmosphere is everything.">
      <Label muted>Weather</Label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
        {WEATHER_OPTIONS.map(w => (
          <button key={w.value} onClick={() => onWeather(w.value)}
            style={{ background: weather === w.value ? `${C.blue}12` : C.raised,
              border: `${weather === w.value ? 2 : 1}px solid ${weather === w.value ? C.blue : C.border}`, borderRadius: 0,
              padding: '12px 8px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{w.icon}</div>
            <div style={{ fontSize: 11, color: C.textPrimary }}>{w.label}</div>
          </button>
        ))}
      </div>
      <Label muted>Time of day</Label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {TIME_OPTIONS.map(t => (
          <button key={t.value} onClick={() => onTime(t.value)}
            style={{ background: t.gradient, border: `2px solid ${timeOfDay === t.value ? C.blue : 'transparent'}`,
              borderRadius: 0, padding: '14px 8px', textAlign: 'center', cursor: 'pointer', color: '#fff' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</div>
          </button>
        ))}
      </div>
    </StepShell>
  )
}

// ── Step 5 ──────────────────────────────────────────────────────────────────
const AID_ROWS = [
  { key: 'tc',         label: 'Traction control',  hint: 'Save me from myself' },
  { key: 'abs',        label: 'ABS',                hint: 'I like my tyres' },
  { key: 'stability',  label: 'Stability control',  hint: 'Easy mode' },
  { key: 'autoclutch', label: 'Auto clutch',        hint: 'Manual is overrated' },
]

function RulesStep({ subtitle, maxClients, onMaxClients, allowances, onAllowance, password, onPassword }) {
  return (
    <StepShell emoji="📋" name="Rules & limits" subtitle={subtitle}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <Label>How many drivers?</Label>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{driverCountLabel(maxClients)} ({maxClients})</span>
        </div>
        <Tooltip text="Maximum number of simultaneous players (affects performance)">
          <input type="range" min={1} max={24} value={maxClients} onChange={e => onMaxClients(+e.target.value)}
            style={{ width: '100%', accentColor: C.blue }} />
        </Tooltip>
      </div>
      {AID_ROWS.map(a => (
        <Tooltip key={a.key} text={`"${a.hint}" — toggle whether players can use ${a.label.toLowerCase()}`}>
          <Toggle label={`${a.label} — "${a.hint}"`} value={allowances[a.key]} onChange={v => onAllowance(a.key, v)} />
        </Tooltip>
      ))}
      <div style={{ marginTop: 12 }}>
        <Label>Secret password (optional)</Label>
        <TextInput value={password} onChange={onPassword} placeholder="Leave blank for open lobby" />
      </div>
    </StepShell>
  )
}

// ── Step 6 ──────────────────────────────────────────────────────────────────
function LaunchStep({ cfg, sessionType, track, weather, timeOfDay, maxClients, deploying, saved, onLaunch, onSaveFirst }) {
  const typeLabel = SESSION_TYPES.find(t => t.id === sessionType)?.label || 'Session'
  const timeLabel = (TIME_OPTIONS.find(t => t.value === timeOfDay)?.label || '').toLowerCase()
  const weatherLabel = (weather || '').toLowerCase()
  const summary = `${typeLabel} at ${track?.name || 'no track'} on a ${weatherLabel} ${timeLabel}. ` +
    `${maxClients} driver${maxClients !== 1 ? 's' : ''}, TC ${cfg.allowances.tc ? 'on' : 'off'}, ` +
    `${cfg.password ? 'password protected' : 'no password'}. Let's go.`

  const cells = [
    ['Session type', typeLabel],
    ['Track', track?.name || '—'],
    ['Cars', `${cfg.cars.length} model${cfg.cars.length !== 1 ? 's' : ''}`],
    ['Weather', weather || '—'],
    ['Time', TIME_OPTIONS.find(t => t.value === timeOfDay)?.label || '—'],
    ['Players', maxClients],
  ]

  return (
    <StepShell emoji="🏁" name="Launch it" subtitle={summary}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 22 }}>
        {cells.map(([label, val]) => (
          <div key={label} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 0, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.blue }}>{val}</div>
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      <Tooltip text="Write config files and start acServer.exe right now" disabled={deploying}>
        <Btn size="lg" style={{ width: '100%', marginBottom: 10 }} disabled={deploying} onClick={onLaunch}>
          {deploying ? 'Launching…' : '✨ Launch now'}
        </Btn>
      </Tooltip>
      <Tooltip text="Save this config as a preset, then you can launch it whenever you like" disabled={deploying}>
        <Btn variant="ghost" style={{ width: '100%' }} onClick={onSaveFirst} disabled={deploying}>
          {saved ? '✓ Saved — Launch now above' : 'Save to Garage first'}
        </Btn>
      </Tooltip>
    </StepShell>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function ServerWizard({ onClose, onDeploy, onSave, onGoSettings }) {
  const { settings } = useStore()
  const [step, setStep] = useState(1)
  const [sessionType, setSessionType] = useState(null)
  const [track, setTrack] = useState(null)
  const [cars, setCars] = useState([])
  const [weather, setWeather] = useState(null)
  const [timeOfDay, setTimeOfDay] = useState(null)
  const [maxClients, setMaxClients] = useState(6)
  const [allowances, setAllowances] = useState({ tc: false, abs: false, stability: false, autoclutch: false })
  const [password, setPassword] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [saved, setSaved] = useState(false)

  const selectSessionType = (id) => {
    setSessionType(id)
    setWeather(CONDITIONS_DEFAULTS[id].weather)
    setTimeOfDay(CONDITIONS_DEFAULTS[id].time)
    setAllowances(AIDS_DEFAULTS[id])
    setTimeout(() => setStep(2), 300)
  }

  const canAdvance = () => {
    if (step === 1) return !!sessionType
    if (step === 2) return !!track
    if (step === 3) return cars.length > 0
    if (step === 4) return !!weather && !!timeOfDay
    return true
  }

  const goNext = () => { if (step < TOTAL_STEPS && canAdvance()) setStep(s => s + 1) }
  const goPrev = () => setStep(s => Math.max(1, s - 1))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionType, track, cars, weather, timeOfDay])

  const cfg = useMemo(() => {
    const base = defaultCfg(settings.serverName)
    return {
      ...base,
      trackId: track?.name || '', trackPath: track?.path || '', layoutId: track?.layouts?.[0] || '',
      cars, maxClients, weather: weather || 'Clear', time: timeOfDay || 'Midday (12:00)', password,
      allowances: { ...base.allowances, ...allowances },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.serverName, track, cars, maxClients, weather, timeOfDay, password, allowances])

  const launchNow = async () => {
    setDeploying(true)
    const res = await onDeploy(cfg)
    setDeploying(false)
    if (res?.ok) onClose()
  }
  const saveFirst = async () => {
    await onSave(cfg)
    setSaved(true)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, zIndex: 50, animation: 'fadeUp .2s ease',
      display: 'flex', flexDirection: 'column',
      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #0A0C1210 40px, #0A0C1210 41px),' +
        'repeating-linear-gradient(90deg, transparent, transparent 40px, #0A0C1210 40px, #0A0C1210 41px)' }}>
      <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: C.head, fontSize: 16, color: C.mutedHi, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            {STEP_NAMES[step - 1]}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: C.head, fontSize: 13, letterSpacing: 1, color: C.blue }}>Step {step} of {TOTAL_STEPS}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        <div style={{ height: 4, background: C.border, borderRadius: 0, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(step / TOTAL_STEPS) * 100}%`, background: C.blue, transition: 'width .25s ease' }} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          {step === 1 && <SessionTypeStep value={sessionType} onSelect={selectSessionType} />}
          {step === 2 && (
            <TrackStep acPath={settings.acPath} subtitle={TRACK_SUBTITLE[sessionType] || 'Pick somewhere good.'}
              value={track} onSelect={setTrack} onGoSettings={onGoSettings} />
          )}
          {step === 3 && (
            <CarsStep acPath={settings.acPath} subtitle={CARS_SUBTITLE[sessionType] || 'Pick your cars.'}
              sessionType={sessionType} selected={cars} onChange={setCars} />
          )}
          {step === 4 && (
            <ConditionsStep weather={weather} timeOfDay={timeOfDay} onWeather={setWeather} onTime={setTimeOfDay} />
          )}
          {step === 5 && (
            <RulesStep subtitle={RULES_SUBTITLE[sessionType] || 'House rules.'} maxClients={maxClients}
              onMaxClients={setMaxClients} allowances={allowances}
              onAllowance={(k, v) => setAllowances(prev => ({ ...prev, [k]: v }))}
              password={password} onPassword={setPassword} />
          )}
          {step === 6 && (
            <LaunchStep cfg={cfg} sessionType={sessionType} track={track} weather={weather} timeOfDay={timeOfDay}
              maxClients={maxClients} deploying={deploying} saved={saved} onLaunch={launchNow} onSaveFirst={saveFirst} />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28 }}>
            {step > 1 && <Btn variant="ghost" onClick={goPrev}>← Back</Btn>}
            {step < TOTAL_STEPS && <Btn onClick={goNext} disabled={!canAdvance()}>Next →</Btn>}
          </div>
        </div>
      </div>
    </div>
  )
}
