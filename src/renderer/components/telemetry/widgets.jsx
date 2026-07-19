import { useState, useEffect } from 'react'
import { C } from '../primitives'

// All telemetry widgets are self-contained, accept { frame, config }, and must
// never crash on missing/partial data — every frame field is read with `??`.
// They render on both a dark app background and a transparent overlay
// background, so none of them paint an opaque full-bleed background of their
// own; the OverlayApp wrapper applies the semi-transparent card treatment.

const WHEEL_LABELS = ['FL', 'FR', 'RL', 'RR']

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

// ── Speed Gauge ────────────────────────────────────────────────────────────
export function SpeedGauge({ frame, config = {} }) {
  const unit = config.unit === 'mph' ? 'mph' : 'kmh'
  const speedKmh = frame?.speed ?? 0
  const display = unit === 'mph' ? speedKmh * 0.621371 : speedKmh
  return (
    <div style={{ width: 160, height: 160, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: C.head, fontSize: 64, color: C.textPrimary, lineHeight: 1 }}>{Math.round(display)}</div>
        <div style={{ fontFamily: C.body, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted, marginTop: 2 }}>
          {unit === 'mph' ? 'mph' : 'km/h'}
        </div>
      </div>
    </div>
  )
}

// ── RPM + Gear Bar ─────────────────────────────────────────────────────────
export function RPMBar({ frame }) {
  const rpm = frame?.rpm ?? 0
  const maxRpm = frame?.maxRpm ?? 8000
  const pct = Math.max(0, Math.min(1, rpm / maxRpm))
  const color = pct < 0.8 ? C.blue : pct < 0.95 ? C.orange : C.red
  const gear = frame?.gear ?? 0
  const gearLabel = gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear)
  const gearColor = gear === -1 ? C.red : gear === 0 ? C.muted : C.textPrimary
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, width: 260 }}>
      <div style={{ fontFamily: C.head, fontSize: 48, color: gearColor, lineHeight: 1 }}>{gearLabel}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <span style={{ fontFamily: C.head, fontSize: 28, color: C.textPrimary }}>{Math.round(rpm)}</span>
        </div>
        <div style={{ position: 'relative', height: 8, background: C.border, width: '100%' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: color, transition: 'width .1s' }} />
          <div style={{ position: 'absolute', left: '95%', top: -2, bottom: -2, width: 2, background: C.red }} />
        </div>
        <div style={{ fontFamily: C.body, fontSize: 9, color: C.muted, marginTop: 3 }}>RPM</div>
      </div>
    </div>
  )
}

// ── Gear Display (large) ──────────────────────────────────────────────────
export function GearDisplay({ frame }) {
  const gear = frame?.gear ?? 0
  const label = gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear)
  const color = gear === -1 ? C.red : gear === 0 ? C.muted : C.textPrimary
  return (
    <div style={{ width: 120, height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: C.head, fontSize: 96, color, lineHeight: 1 }}>{label}</div>
      <div style={{ fontFamily: C.body, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted, marginTop: 4 }}>Gear</div>
    </div>
  )
}

// ── Throttle & Brake Bars ──────────────────────────────────────────────────
function BarColumn({ value, color, label }) {
  const pct = Math.max(0, Math.min(1, value ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, marginBottom: 2 }}>{Math.round(pct * 100)}%</div>
      <div style={{ width: 20, height: 80, background: C.bg, border: `1px solid ${C.border}`, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct * 100}%`, background: color }} />
      </div>
      <div style={{ fontFamily: C.body, fontSize: 9, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  )
}
export function ThrottleBrakeBar({ frame }) {
  const clutch = frame?.clutch ?? 0
  return (
    <div style={{ width: 60, height: 100, display: 'flex', gap: 6, alignItems: 'flex-end', justifyContent: 'center' }}>
      <BarColumn value={frame?.throttle} color={C.blue} label="T" />
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 80, paddingBottom: 18 }}>
        <div style={{ width: 6, height: 6, background: clutch > 0.05 ? C.muted : 'transparent', border: `1px solid ${C.border}` }} />
      </div>
      <BarColumn value={frame?.brake} color={C.red} label="B" />
    </div>
  )
}

// ── Steering Angle (not in the widget spec proper, but listed in the CONTROLS
// checklist — a compact centered deflection indicator) ────────────────────
export function SteeringAngle({ frame }) {
  const angle = Math.max(-1, Math.min(1, frame?.steerAngle ?? 0))
  return (
    <div style={{ width: 100, height: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: 80, height: 4, background: C.border }}>
        <div style={{ position: 'absolute', left: '50%', top: -6, width: 2, height: 16, background: C.borderHi, transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', left: `${50 + angle * 50}%`, top: -6, width: 2, height: 16, background: C.blue, transform: 'translateX(-50%)' }} />
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{(angle * 100).toFixed(0)}%</div>
    </div>
  )
}

// ── Tyre Map ───────────────────────────────────────────────────────────────
function tyreTempColor(t) {
  if (t < 60) return C.blue
  if (t < 80) return '#00AAFF'
  if (t < 90) return C.green
  if (t < 100) return C.orange
  return C.red
}
// Brake discs run far hotter than tyres (100s-1000+°C) — a coarser 3-tier
// scale rather than tyreTempColor's tighter tyre-temp bands.
function brakeTempColor(t) {
  if (t < 300) return C.blue
  if (t < 550) return C.orange
  return C.red
}
function TyreCorner({ label, temp, tempI, tempM, tempO, wear, pressure, brakeTemp }) {
  const color = tyreTempColor(temp ?? 0)
  const w = wear ?? 0
  const healthPct = Math.max(0, Math.min(1, 1 - w))
  const wearColor = w < 0.5 ? C.green : w < 0.8 ? C.orange : C.red
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56 }}>
      <div style={{ fontFamily: C.body, fontSize: 8, color: C.muted, marginBottom: 2, letterSpacing: 1 }}>{label}</div>
      <div style={{ width: 48, height: 48, background: `${color}40`, border: `2px solid ${color}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: C.head, fontSize: 18, color }}>{Math.round(temp ?? 0)}</span>
        </div>
        <div style={{ display: 'flex', height: 12 }}>
          <div style={{ flex: 1, background: tyreTempColor(tempI ?? 0) }} />
          <div style={{ flex: 1, background: tyreTempColor(tempM ?? 0) }} />
          <div style={{ flex: 1, background: tyreTempColor(tempO ?? 0) }} />
        </div>
      </div>
      <div style={{ width: 48, height: 4, background: C.border, marginTop: 4 }}>
        <div style={{ width: `${healthPct * 100}%`, height: '100%', background: wearColor }} />
      </div>
      {/* Brake temp — only ACC (and games that expose it) populate this; null elsewhere, so nothing renders. */}
      {brakeTemp != null && (
        <div style={{ width: 48, height: 3, background: C.border, marginTop: 2 }} title={`Brake ${Math.round(brakeTemp)}°C`}>
          <div style={{ width: `${Math.max(0, Math.min(1, brakeTemp / 800)) * 100}%`, height: '100%', background: brakeTempColor(brakeTemp) }} />
        </div>
      )}
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, marginTop: 2 }}>{(pressure ?? 0).toFixed(1)}</div>
    </div>
  )
}
export function TyreMap({ frame }) {
  const temp = frame?.tyreTemp ?? [0, 0, 0, 0]
  const tempI = frame?.tyreTempI ?? [0, 0, 0, 0]
  const tempM = frame?.tyreTempM ?? [0, 0, 0, 0]
  const tempO = frame?.tyreTempO ?? [0, 0, 0, 0]
  const wear = frame?.tyreWear ?? [0, 0, 0, 0]
  const pressure = frame?.tyrePressure ?? [0, 0, 0, 0]
  const brakeTemp = frame?.brakeTemp ?? [null, null, null, null]
  const corner = (i) => ({ label: WHEEL_LABELS[i], temp: temp[i], tempI: tempI[i], tempM: tempM[i], tempO: tempO[i], wear: wear[i], pressure: pressure[i], brakeTemp: brakeTemp[i] })
  return (
    <div style={{ width: 180, height: 160, display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gridTemplateRows: '1fr 1fr',
      gap: 4, alignItems: 'center', justifyItems: 'center' }}>
      <div style={{ gridColumn: 1, gridRow: 1 }}><TyreCorner {...corner(0)} /></div>
      <div style={{ gridColumn: 2, gridRow: '1 / 3', width: 20, height: 40, border: `1px solid ${C.border}` }} />
      <div style={{ gridColumn: 3, gridRow: 1 }}><TyreCorner {...corner(1)} /></div>
      <div style={{ gridColumn: 1, gridRow: 2 }}><TyreCorner {...corner(2)} /></div>
      <div style={{ gridColumn: 3, gridRow: 2 }}><TyreCorner {...corner(3)} /></div>
    </div>
  )
}

// ── Tyre Pressures (standalone, compact) ──────────────────────────────────
export function TyrePressures({ frame }) {
  const pressure = frame?.tyrePressure ?? [0, 0, 0, 0]
  return (
    <div style={{ width: 120, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {WHEEL_LABELS.map((l, i) => (
        <div key={l} style={{ textAlign: 'center', border: `1px solid ${C.border}`, padding: '6px 4px' }}>
          <div style={{ fontFamily: C.mono, fontSize: 14, color: C.blue }}>{(pressure[i] ?? 0).toFixed(1)}</div>
          <div style={{ fontFamily: C.body, fontSize: 8, color: C.muted, marginTop: 2 }}>{l}</div>
        </div>
      ))}
    </div>
  )
}

// ── G-Force Circle ──────────────────────────────────────────────────────────
export function GForceCircle({ frame }) {
  const gLat = frame?.gLat ?? 0
  const gLon = frame?.gLon ?? 0
  const [trail, setTrail] = useState([])
  useEffect(() => {
    setTrail(prev => [...prev, { x: gLat, y: gLon }].slice(-30))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gLat, gLon])

  const size = 140, cx = size / 2, cy = size / 2, r = 55, maxG = 1.5
  const scale = r / maxG
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r * (0.5 / maxG)} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="2 3" />
        <circle cx={cx} cy={cy} r={r * (1.0 / maxG)} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="2 3" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={1} />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={C.border} strokeWidth={0.5} />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={C.border} strokeWidth={0.5} />
        {trail.map((pt, i) => (
          <circle key={i} cx={cx + pt.x * scale} cy={cy - pt.y * scale} r={3} fill={C.blue}
            opacity={0.1 + (i / Math.max(1, trail.length)) * 0.7} />
        ))}
        <circle cx={cx + gLat * scale} cy={cy - gLon * scale} r={4} fill={C.blue} />
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill={C.muted} fontFamily={C.body}>G</text>
        <text x={cx} y={14} textAnchor="middle" fontSize={8} fill={C.muted} fontFamily={C.body}>BRAKE</text>
        <text x={cx} y={size - 6} textAnchor="middle" fontSize={8} fill={C.muted} fontFamily={C.body}>ACC</text>
        <text x={8} y={cy + 3} textAnchor="start" fontSize={8} fill={C.muted} fontFamily={C.body}>L</text>
        <text x={size - 8} y={cy + 3} textAnchor="end" fontSize={8} fill={C.muted} fontFamily={C.body}>R</text>
      </svg>
    </div>
  )
}

// ── Lap Timing Panel ───────────────────────────────────────────────────────
export function LapTimingPanel({ frame }) {
  const current = frame?.currentLapTime || '-:--.---'
  const best = frame?.bestLapTime || '-:--.---'
  const last = frame?.lastLapTime || '-:--.---'
  const deltaMs = frame?.deltaMs ?? 0
  const hasBest = (frame?.bestLapMs ?? 0) > 0
  const deltaColor = !hasBest ? C.muted : deltaMs < 0 ? C.blue : C.red
  const deltaLabel = !hasBest ? '--:--.---' : `${deltaMs < 0 ? '▲' : '▼'} ${Math.abs(deltaMs / 1000).toFixed(3)}`
  const sector = frame?.sector ?? 0
  const lap = frame?.completedLaps ?? 0
  return (
    <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: C.head, fontSize: 36, color: C.textPrimary, lineHeight: 1 }}>{current}</div>
      <div style={{ fontFamily: C.head, fontSize: 16, color: deltaColor }}>{deltaLabel}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: C.head, fontSize: 20, color: C.yellow }}>{best}</span>
        <span style={{ fontFamily: C.head, fontSize: 20, color: C.muted }}>{last}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, height: 6,
            background: i < sector ? C.green : C.border,
            border: i === sector ? `1px solid ${C.blue}` : 'none' }} />
        ))}
      </div>
      <div style={{ fontFamily: C.head, fontSize: 14, color: C.muted, marginTop: 4 }}>LAP {lap}</div>
    </div>
  )
}

// ── Fuel Bar ───────────────────────────────────────────────────────────────
export function FuelBar({ frame }) {
  // Forza's Fuel field is already a 0-1 fraction of the tank, not litres —
  // there's no absolute tank size in the packet (maxFuel is null for
  // fh5/fh6, see normalizer.js), so it's shown as a percentage instead.
  const isForza = frame?.game === 'fh5' || frame?.game === 'fh6'
  const fuel = frame?.fuel ?? 0
  const maxFuel = frame?.maxFuel ?? 0
  const pct = isForza ? Math.max(0, Math.min(1, fuel)) : (maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0)
  const color = pct > 0.4 ? C.blue : pct > 0.15 ? C.orange : C.red
  const perLap = frame?.fuelPerLap ?? 0
  return (
    <div style={{ width: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: C.head, fontSize: 24, color: C.textPrimary }}>
          {isForza ? `${Math.round(pct * 100)}%` : `${fuel.toFixed(1)}L`}
        </span>
        <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Fuel</span>
      </div>
      <div style={{ height: 8, background: C.border, marginTop: 4 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color }} />
      </div>
      {!isForza && perLap > 0 && (
        <div style={{ fontFamily: C.body, fontSize: 10, color: C.muted, marginTop: 4 }}>~{(fuel / perLap).toFixed(1)} LAPS</div>
      )}
    </div>
  )
}

// ── Damage Panel ───────────────────────────────────────────────────────────
// AC's raw carDamage floats are unbounded deformation magnitudes, not a clean
// 0-1 range — this divisor is an approximation (no fixed max exists in the
// struct), tuned so light contact reads low and heavy damage reads high.
const DAMAGE_ZONES = ['Front', 'Rear', 'Left', 'Right', 'Centre']
export function DamagePanel({ frame }) {
  const damage = frame?.carDamage ?? [0, 0, 0, 0, 0]
  return (
    <div style={{ width: 160 }}>
      <div style={{ fontFamily: C.head, fontSize: 14, color: C.red, marginBottom: 6 }}>DAMAGE</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {DAMAGE_ZONES.map((z, i) => {
          const v = Math.max(0, Math.min(1, (damage[i] ?? 0) / 1000))
          const color = v < 0.3 ? C.green : v < 0.6 ? C.orange : C.red
          return (
            <div key={z}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>{z}</span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textSec }}>{(v * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 5, background: C.border }}>
                <div style={{ width: `${v * 100}%`, height: '100%', background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Suspension Travel ──────────────────────────────────────────────────────
export function SuspensionBars({ frame }) {
  const travel = frame?.suspensionTravel ?? [0, 0, 0, 0]
  return (
    <div style={{ width: 120, height: 100, display: 'flex', gap: 8, alignItems: 'flex-end', justifyContent: 'center' }}>
      {WHEEL_LABELS.map((l, i) => {
        const v = travel[i] ?? 0
        const pct = Math.max(0, Math.min(1, (v + 0.05) / 0.1))
        return (
          <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontFamily: C.mono, fontSize: 8, color: C.muted, marginBottom: 2 }}>{v.toFixed(3)}</div>
            <div style={{ width: 14, height: 70, background: C.bg, border: `1px solid ${C.border}`, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: C.borderHi }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct * 100}%`, background: C.blue }} />
            </div>
            <div style={{ fontFamily: C.body, fontSize: 8, color: C.muted, marginTop: 2 }}>{l}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Status Bar ─────────────────────────────────────────────────────────────
const FLAG_COLORS = { 0: 'transparent', 1: C.blue, 2: C.yellow, 3: C.textPrimary, 4: C.whiteHot, 6: C.border }
const RAIN_ICONS = { 0: null, 1: '🌦', 2: '🌧', 3: '⛈' }
function StatItem({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span style={{ fontFamily: C.body, fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      {children}
    </div>
  )
}
export function StatusBar({ frame }) {
  const flag = frame?.flag ?? 0
  const session = frame?.session ?? 'UNKNOWN'
  const position = frame?.position ?? 0
  const laps = frame?.completedLaps ?? 0
  const timeLeft = Math.max(0, frame?.sessionTimeLeft ?? 0)
  const mm = Math.floor(timeLeft / 60), ss = Math.floor(timeLeft % 60)
  return (
    <div style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', gap: 24, padding: '0 16px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
      <StatItem label="Flag">
        <div style={{ width: 14, height: 14, border: `1px solid ${C.border}`,
          background: flag === 5 ? `repeating-linear-gradient(45deg, ${C.textPrimary} 0 4px, ${C.muted} 4px 8px)` : (FLAG_COLORS[flag] || C.border) }} />
      </StatItem>
      {frame?.rainIntensity != null && RAIN_ICONS[frame.rainIntensity] && (
        <StatItem label="Rain"><span style={{ fontSize: 16, lineHeight: 1 }}>{RAIN_ICONS[frame.rainIntensity]}</span></StatItem>
      )}
      <StatItem label="Session"><span style={{ fontFamily: C.head, fontSize: 14, color: C.textPrimary }}>{session}</span></StatItem>
      <StatItem label="Position"><span style={{ fontFamily: C.head, fontSize: 14, color: C.textPrimary }}>P{position}</span></StatItem>
      <StatItem label="Laps"><span style={{ fontFamily: C.head, fontSize: 14, color: C.textPrimary }}>{laps}</span></StatItem>
      <StatItem label="Time left"><span style={{ fontFamily: C.head, fontSize: 14, color: C.textPrimary }}>{mm}:{String(ss).padStart(2, '0')}</span></StatItem>
    </div>
  )
}

// ── Mini Speed + Gear ──────────────────────────────────────────────────────
export function MiniSpeed({ frame }) {
  const gear = frame?.gear ?? 0
  const gearLabel = gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear)
  const speed = Math.round(frame?.speed ?? 0)
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontFamily: C.head, fontSize: 28, color: C.textPrimary }}>{gearLabel} · {speed} KMH</span>
    </div>
  )
}

// ── Input Trace ────────────────────────────────────────────────────────────
export function InputTrace({ frame }) {
  const [history, setHistory] = useState([])
  useEffect(() => {
    const now = Date.now()
    setHistory(prev => [...prev, { t: now, throttle: frame?.throttle ?? 0, brake: frame?.brake ?? 0 }].filter(p => now - p.t <= 5000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.throttle, frame?.brake])

  const W = 240, H = 80
  const now = Date.now()
  const pathFor = (key) => history.map((p, i) => {
    const x = W - ((now - p.t) / 5000) * W
    const y = H - p[key] * H
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  return (
    <div style={{ width: W, height: H, background: C.bg, position: 'relative' }}>
      <svg width={W} height={H}>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke={C.border} strokeWidth={0.5} opacity={0.4} />
        ))}
        {history.length > 1 && <path d={pathFor('throttle')} fill="none" stroke={C.blue} strokeWidth={1.5} />}
        {history.length > 1 && <path d={pathFor('brake')} fill="none" stroke={C.red} strokeWidth={1.5} />}
      </svg>
    </div>
  )
}

// ── Gap Widget (AC Evo) ────────────────────────────────────────────────────
// Only ever populated by AC Evo (gapAhead/gapBehind are null for every other
// game — see normalizer.js) — shows "--" rather than fabricating a number
// for games that don't expose this.
export function GapWidget({ frame }) {
  const ahead = frame?.gapAhead
  const behind = frame?.gapBehind
  const fmt = (v) => (v == null ? '--' : `${v.toFixed(1)}s`)
  // Closing the gap ahead (getting smaller) or extending the gap behind
  // (growing) are both "good" — green; the reverse is red.
  const aheadColor = ahead == null ? C.muted : ahead >= 0 ? C.green : C.red
  const behindColor = behind == null ? C.muted : behind >= 0 ? C.green : C.red
  return (
    <div style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: C.head, fontSize: 28, color: aheadColor }}>▲ {fmt(ahead)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: C.head, fontSize: 28, color: behindColor }}>▼ {fmt(behind)}</span>
      </div>
      <div style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Gap ahead / behind</div>
    </div>
  )
}

// ── Boost Gauge (Forza) ────────────────────────────────────────────────────
// Populated from either frame.boost (Forza) or frame.turboBoost (ACC/AC
// Evo) — whichever a given game actually exposes; null on every other field
// path is left alone rather than guessed at.
export function BoostGauge({ frame }) {
  const raw = frame?.boost ?? frame?.turboBoost
  const pct = raw == null ? 0 : Math.max(0, Math.min(1, raw))
  const cx = 60, cy = 60, r = 50
  const startAngle = -135, endAngle = 135
  const fillAngle = startAngle + 270 * pct
  return (
    <div style={{ width: 120, height: 120, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={120} height={120} style={{ position: 'absolute', inset: 0 }}>
        <path d={describeArc(cx, cy, r, startAngle, endAngle)} fill="none" stroke={C.border} strokeWidth={4} />
        {raw != null && pct > 0 && <path d={describeArc(cx, cy, r, startAngle, fillAngle)} fill="none" stroke={C.blue} strokeWidth={4} />}
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: C.head, fontSize: 28, color: C.textPrimary, lineHeight: 1 }}>{raw == null ? '--' : raw.toFixed(2)}</div>
        <div style={{ fontFamily: C.body, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted, marginTop: 2 }}>Boost</div>
      </div>
    </div>
  )
}

// ── Power / Torque (Forza) ──────────────────────────────────────────────────
export function PowerTorque({ frame }) {
  const power = frame?.power // watts
  const torque = frame?.torque // N·m
  return (
    <div style={{ width: 160, display: 'flex', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: C.head, fontSize: 26, color: C.textPrimary }}>{power == null ? '--' : Math.round(power / 1000)}</div>
        <div style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>kW</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: C.head, fontSize: 26, color: C.textPrimary }}>{torque == null ? '--' : Math.round(torque)}</div>
        <div style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>N·m</div>
      </div>
    </div>
  )
}

// ── ERS Status (F1 25) ──────────────────────────────────────────────────────
// Explicitly game-gated per the Phase 15 brief ("only shows when
// game === 'f125'") — returns null rather than a "--" placeholder, unlike
// most other widgets here, since ERS deploy modes are a genuinely F1-specific
// concept with no sensible cross-game fallback display.
const ERS_DEPLOY_LABELS = { 0: 'NONE', 1: 'MED', 2: 'HOTLAP', 3: 'OVERTAKE' }
export function ERSWidget({ frame }) {
  if (frame?.game !== 'f125') return null
  const energy = frame?.ersStoreEnergy
  const pct = energy == null ? 0 : Math.max(0, Math.min(1, energy / 4000000)) // 4MJ = F1's ERS store capacity
  const deployMode = frame?.ersDeployMode
  const deploying = deployMode != null && deployMode > 0
  const color = energy == null ? C.muted : deploying ? C.green : C.blue
  return (
    <div style={{ width: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: C.head, fontSize: 22, color: C.textPrimary }}>{energy == null ? '--' : `${Math.round(pct * 100)}%`}</span>
        <span style={{ fontFamily: C.head, fontSize: 11, color, border: `1px solid ${color}`, padding: '1px 6px' }}>
          {deployMode == null ? '--' : (ERS_DEPLOY_LABELS[deployMode] || deployMode)}
        </span>
      </div>
      <div style={{ height: 8, background: C.border, marginTop: 6 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color }} />
      </div>
      <div style={{ fontFamily: C.body, fontSize: 9, color: C.muted, marginTop: 4, textTransform: 'uppercase' }}>ERS Store</div>
    </div>
  )
}

// ── Boost (AMS2) ─────────────────────────────────────────────────────────
// Distinct from BoostGauge (Forza/ACC/AC Evo's 0-1 fraction reading) — AMS2's
// boostAmount is a 0-100 percentage with its own on/off flag, so this is its
// own widget rather than overloading BoostGauge's shape. Gated on both game
// and boostActive per the brief — renders nothing otherwise, same reasoning
// as ERSWidget above.
export function AMS2BoostWidget({ frame }) {
  if (frame?.game !== 'ams2' || !frame?.boostActive) return null
  const amount = frame?.boostAmount ?? 0
  const pct = Math.max(0, Math.min(1, amount / 100))
  return (
    <div style={{ width: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: C.head, fontSize: 24, color: C.orange }}>{Math.round(amount)}%</span>
        <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Boost</span>
      </div>
      <div style={{ height: 8, background: C.border, marginTop: 6 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: C.orange }} />
      </div>
    </div>
  )
}

// ── Widget catalog — single source of truth for the CONFIGURE checklist,
// preset definitions, and the LIVE/overlay renderers ──────────────────────
export const WIDGET_CATALOG = [
  { id: 'speedGauge',       label: 'Speed Gauge',              category: 'MOTION',   component: SpeedGauge,       defaultSize: 'md' },
  { id: 'rpmBar',           label: 'RPM + Gear Bar',            category: 'MOTION',   component: RPMBar,           defaultSize: 'md' },
  { id: 'gearDisplay',      label: 'Gear Display (large)',      category: 'MOTION',   component: GearDisplay,      defaultSize: 'sm' },
  { id: 'gForceCircle',     label: 'G-Force Circle',            category: 'MOTION',   component: GForceCircle,     defaultSize: 'sm' },
  { id: 'inputTrace',       label: 'Input Trace',               category: 'MOTION',   component: InputTrace,       defaultSize: 'md' },
  { id: 'boostGauge',       label: 'Boost Gauge',               category: 'MOTION',   component: BoostGauge,       defaultSize: 'sm' },
  { id: 'powerTorque',      label: 'Power / Torque',             category: 'MOTION',   component: PowerTorque,      defaultSize: 'sm' },
  { id: 'throttleBrakeBar', label: 'Throttle & Brake Bars',      category: 'CONTROLS', component: ThrottleBrakeBar, defaultSize: 'sm' },
  { id: 'steeringAngle',    label: 'Steering Angle',             category: 'CONTROLS', component: SteeringAngle,    defaultSize: 'sm' },
  { id: 'tyreMap',          label: 'Tyre Map',                  category: 'TYRES',    component: TyreMap,          defaultSize: 'lg' },
  { id: 'tyrePressures',    label: 'Tyre Pressures',             category: 'TYRES',    component: TyrePressures,    defaultSize: 'sm' },
  { id: 'suspensionBars',   label: 'Suspension Travel',          category: 'TYRES',    component: SuspensionBars,   defaultSize: 'sm' },
  { id: 'lapTiming',        label: 'Lap Timing Panel',           category: 'SESSION',  component: LapTimingPanel,   defaultSize: 'md' },
  { id: 'fuelBar',          label: 'Fuel Bar',                  category: 'SESSION',  component: FuelBar,          defaultSize: 'md' },
  { id: 'statusBar',        label: 'Status Bar',                category: 'SESSION',  component: StatusBar,        defaultSize: 'lg' },
  { id: 'damagePanel',      label: 'Damage Panel',               category: 'SESSION',  component: DamagePanel,      defaultSize: 'md' },
  { id: 'gapWidget',        label: 'Gap Ahead / Behind',         category: 'SESSION',  component: GapWidget,        defaultSize: 'sm' },
  { id: 'ersWidget',        label: 'ERS Status (F1 25)',         category: 'SESSION',  component: ERSWidget,        defaultSize: 'sm' },
  { id: 'ams2Boost',        label: 'Boost (AMS2)',               category: 'MOTION',   component: AMS2BoostWidget,  defaultSize: 'sm' },
  { id: 'miniSpeed',        label: 'Mini Speed + Gear',           category: 'MINIMAL',  component: MiniSpeed,        defaultSize: 'sm' },
]

export const WIDGET_CATEGORIES = ['MOTION', 'CONTROLS', 'TYRES', 'SESSION', 'MINIMAL']

export const SIZE_PRESETS = {
  sm: { colSpan: 3, height: 140, label: 'Small' },
  md: { colSpan: 4, height: 180, label: 'Medium' },
  lg: { colSpan: 6, height: 220, label: 'Large' },
}
