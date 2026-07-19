import { useState } from 'react'

export const C = {
  // Backgrounds — pure black terminal look (Port Manager style)
  bg:        '#000000',      // pure black
  surface:   '#0A0A0A',      // panel background
  raised:    '#101010',      // elevated elements, inputs
  overlay:   '#161616',      // modals, overlays

  // Borders — low-contrast, subtle
  border:    '#1A1A1A',      // default border
  borderHi:  '#2A2A2A',      // hover/active border
  borderAcc: '#3A2E10',      // accent-adjacent border

  // Primary accent — amber/gold, matching the Port Manager dashboard
  blue:      '#FFB400',      // primary CTA, active states (kept the "blue" key name so every existing view retints automatically)
  blueDim:   '#8A6200',      // muted amber
  blueGlow:  '#FFB400',      // glow/shadow colour

  // Secondary — pure white, used for primary text
  white:     '#FFFFFF',
  whiteHot:  '#FFFFFF',

  // Status colours — same vocabulary Port Manager uses for its port cards
  green:     '#00FF88',      // success, online, listening
  greenDim:  '#00A855',
  red:       '#FF4444',      // danger, error, offline
  redDim:    '#A82222',
  orange:    '#FF6600',      // warning, update available
  yellow:    '#FFD700',      // gold — personal bests, top rank, favorite stars only

  // Text hierarchy
  textPrimary:  '#FFFFFF',   // main readable text
  textSec:      '#A8A8A8',   // secondary, labels
  muted:        '#5C5C5C',   // disabled, placeholder
  mutedHi:      '#8C8C8C',   // slightly more visible muted

  // Typography — Rubik Mono One for titling, Space Mono for everything else.
  head:  "'Rubik Mono One', 'Courier New', monospace",
  body:  "'Space Mono', 'Courier New', monospace",
  mono:  "'Space Mono', 'Courier New', monospace",

  // Geometry — rounded, soft (Port Manager uses 6-10px throughout)
  radius:    '10px',         // default border radius
  radiusSm:  '4px',          // tiny inline elements (tags, badges)
  radiusMd:  '8px',          // cards, panels, buttons, inputs
}

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rubik+Mono+One&family=Space+Mono:wght@400;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; background: ${C.bg}; color: ${C.textPrimary}; font-family: ${C.body}; overflow: hidden; }
  ::selection { background: ${C.blue}44; color: ${C.whiteHot}; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: ${C.bg}; }
  ::-webkit-scrollbar-thumb { background: ${C.blueDim}; }
  ::-webkit-scrollbar-thumb:hover { background: ${C.blue}; }
  *:focus { outline: none; }
  *:focus-visible { outline: 1px solid ${C.blue}; outline-offset: 2px; }
  input, select, textarea { font-family: ${C.body}; }
  input[type=range] { accent-color: ${C.blue}; cursor: pointer; }
  input[type=checkbox] { accent-color: ${C.blue}; cursor: pointer; width: 14px; height: 14px; }
  select option { background: ${C.raised}; }
  button { cursor: pointer; font-family: ${C.body}; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
  @keyframes speakPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.3); } }
  @keyframes peerGlow { 0%,100% { border-left-color: var(--glow, ${C.blue}); } 50% { border-left-color: ${C.whiteHot}; } }
  @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
  .shimmer-block { background: linear-gradient(90deg, ${C.raised} 25%, #1E1E1E 50%, ${C.raised} 75%);
    background-size: 600px 100%; animation: shimmer 1.6s infinite linear; border-radius: ${C.radiusSm}; }
`

export function Label({ children, muted, style: sx = {} }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase',
      color: muted ? C.muted : C.textSec, marginBottom: 6, fontFamily: C.body, ...sx }}>
      {children}
    </div>
  )
}

export function Tag({ children, color = C.blue, size = 'sm' }) {
  return (
    <span style={{ fontSize: size === 'xs' ? 8 : 9, fontWeight: 700, letterSpacing: 1,
      textTransform: 'uppercase', color, background: `${color}12`, border: `1px solid ${color}40`,
      borderRadius: C.radiusSm, padding: '2px 7px', fontFamily: C.mono, flexShrink: 0, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style: sx = {}, title }) {
  const sizes = {
    xs: { fontSize: 10, padding: '3px 10px' },
    sm: { fontSize: 11, padding: '4px 14px' },
    md: { fontSize: 12, padding: '7px 20px' },
    lg: { fontSize: 14, padding: '10px 28px' },
  }
  const vars = {
    primary: { background: C.blue, color: '#000000', border: 'none' },
    ghost:   { background: 'transparent', color: C.textPrimary, border: `1px solid ${C.border}` },
    danger:  { background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}40` },
    subtle:  { background: C.raised, color: C.textSec, border: `1px solid ${C.border}` },
    success: { background: `${C.green}12`, color: C.green, border: `1px solid ${C.green}40` },
  }
  const hoverIn = {
    primary: e => { e.currentTarget.style.background = '#FFC833'; e.currentTarget.style.boxShadow = `0 0 12px ${C.blueGlow}44` },
    ghost:   e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.blue },
    danger:  e => { e.currentTarget.style.background = `${C.red}22`; e.currentTarget.style.borderColor = C.red },
    subtle:  e => { e.currentTarget.style.borderColor = C.borderHi },
    success: e => { e.currentTarget.style.background = `${C.green}22`; e.currentTarget.style.borderColor = C.green },
  }
  const hoverOut = {
    primary: e => { e.currentTarget.style.background = C.blue; e.currentTarget.style.boxShadow = 'none' },
    ghost:   e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textPrimary },
    danger:  e => { e.currentTarget.style.background = `${C.red}12`; e.currentTarget.style.borderColor = `${C.red}40` },
    subtle:  e => { e.currentTarget.style.borderColor = C.border },
    success: e => { e.currentTarget.style.background = `${C.green}12`; e.currentTarget.style.borderColor = `${C.green}40` },
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ borderRadius: C.radiusMd, fontFamily: C.body, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        transition: 'background .15s, border-color .15s, color .15s, box-shadow .15s',
        ...sizes[size], ...vars[variant], ...sx }}
      onMouseEnter={e => { if (!disabled) hoverIn[variant]?.(e) }}
      onMouseLeave={e => { if (!disabled) hoverOut[variant]?.(e) }}>
      {children}
    </button>
  )
}

export function Card({ children, style: sx = {}, accent, onClick, onMouseEnter, onMouseLeave }) {
  return (
    <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{ background: C.surface, border: `1px solid ${C.border}`,
        ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
        borderRadius: C.radiusMd, padding: 16, cursor: onClick ? 'pointer' : 'default',
        ...sx }}>
      {children}
    </div>
  )
}

export function SectionHead({ children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: C.head, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: C.textPrimary }}>{children}</div>
      <div style={{ width: 32, height: 2, background: C.blue, borderRadius: 1, marginTop: 6 }} />
      {sub && <div style={{ fontSize: 12, fontFamily: C.body, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 0.01, format, onChange, color = C.blue, hint }) {
  const disp = format ? format(value) : value
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <Label>{label}</Label>
        <span style={{ fontFamily: C.mono, fontSize: 13, color, fontWeight: 700 }}>{disp}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color }} />
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

export function Toggle({ label, value, onChange, hint }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
      <div onClick={() => onChange(!value)}
        style={{ width: 36, height: 20, borderRadius: 10, background: value ? C.blue : C.border,
          position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 18 : 3, width: 14, height: 14,
          borderRadius: '50%', background: value ? '#000000' : C.mutedHi, transition: 'left .2s' }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontFamily: C.body, fontWeight: 500, color: C.textPrimary }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: C.muted }}>{hint}</div>}
      </div>
    </label>
  )
}

export function TextInput({ value, onChange, placeholder, mono, style: sx = {}, onKeyDown }) {
  const [focused, setFocused] = useState(false)
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={onKeyDown}
      style={{ width: '100%', background: C.raised, border: `1px solid ${focused ? C.blue : C.border}`,
        borderRadius: C.radiusMd, color: C.textPrimary, padding: '7px 10px', fontSize: 12,
        fontFamily: mono ? C.mono : C.body, outline: 'none', transition: 'border-color .15s', ...sx }} />
  )
}

export function Select({ value, onChange, options, style: sx = {} }) {
  const [focused, setFocused] = useState(false)
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: '100%', background: C.raised, border: `1px solid ${focused ? C.blue : C.border}`,
        borderRadius: C.radiusMd, color: C.textPrimary, padding: '7px 24px 7px 10px', fontSize: 12, outline: 'none',
        cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', transition: 'border-color .15s',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpolyline points='0,0 5,6 10,0' stroke='%238C8C8C' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        ...sx }}>
      {options.map(o => (
        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  )
}

export function StatusDot({ online, size = 8 }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: online ? C.green : C.red, flexShrink: 0,
      boxShadow: online ? `0 0 6px ${C.green}88` : 'none' }} />
  )
}

export function OfflineBanner({ backendUrl, onRetry }) {
  return (
    <div style={{ background: `${C.orange}18`, borderBottom: `1px solid ${C.orange}60`, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <span style={{ color: C.orange, fontSize: 13, fontWeight: 600 }}>
        ⚠ Can't reach backend at <span style={{ fontFamily: C.mono }}>{backendUrl}</span>
      </span>
      <Btn size="xs" variant="subtle" style={{ marginLeft: 'auto' }} onClick={onRetry}>Retry</Btn>
    </div>
  )
}

export function Divider({ style: sx = {} }) {
  return <div style={{ height: 1, background: C.border, margin: '16px 0', ...sx }} />
}

export function Toast({ msg, color = C.blue, onDone }) {
  const filled = color === C.blue
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28,
      background: filled ? C.blue : `${color}14`,
      border: filled ? 'none' : `1px solid ${color}50`,
      color: filled ? '#000000' : color,
      fontFamily: C.body, fontWeight: 700, letterSpacing: 0.5,
      fontSize: 13, padding: '10px 20px', borderRadius: C.radiusMd,
      boxShadow: '0 4px 24px rgba(0,0,0,.6)', zIndex: 9999, animation: 'fadeUp .2s ease' }}>
      {msg}
    </div>
  )
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 20, flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ padding: '10px 20px', background: 'none', border: 'none',
            color: active === t.id ? C.blue : C.muted, fontFamily: C.body, fontWeight: 600, textTransform: 'uppercase',
            fontSize: 13, letterSpacing: 1, borderBottom: `2px solid ${active === t.id ? C.blue : 'transparent'}`,
            marginBottom: -1, cursor: 'pointer', transition: 'color .1s',
            display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.icon && <span>{t.icon}</span>}
          {t.label}
          {t.badge != null && (
            <span style={{ background: t.badge > 0 ? `${C.red}18` : 'transparent', border: `1px solid ${t.badge > 0 ? C.red : C.border}`,
              color: t.badge > 0 ? C.red : C.muted, borderRadius: C.radiusSm,
              fontSize: 10, padding: '1px 6px', fontFamily: C.mono }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
