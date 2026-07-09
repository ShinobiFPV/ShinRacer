import { useState } from 'react'

export const C = {
  // Backgrounds — true black, not grey-black
  bg:        '#050507',      // near-pure black, slight blue tint
  surface:   '#0A0C12',      // panel background
  raised:    '#0F1218',      // elevated elements
  overlay:   '#141820',      // modals, overlays

  // Borders — sharp, visible, not subtle
  border:    '#1C2233',      // default border
  borderHi:  '#2A3A5C',      // hover/active border
  borderAcc: '#1E3A6E',      // accent-adjacent border

  // Primary accent — electric blue, not soft blue
  blue:      '#0066FF',      // primary CTA, active states
  blueDim:   '#003A99',      // muted blue
  blueGlow:  '#0044CC',      // glow/shadow colour

  // Secondary accent — cold white, used sparingly
  white:     '#E8F0FF',      // primary text, slightly blue-tinted
  whiteHot:  '#FFFFFF',      // pure white for maximum contrast moments

  // Status colours — high contrast, unambiguous
  green:     '#00CC44',      // success, online, installed
  greenDim:  '#007722',
  red:       '#FF1A1A',      // danger, error, stop
  redDim:    '#990000',
  orange:    '#FF6600',      // warning, update available
  yellow:    '#FFD700',      // gold — used ONLY for personal bests,
                              // top rank, and favorite stars
                              // NOT as primary accent anymore

  // Text hierarchy
  textPrimary:  '#E8F0FF',   // main readable text
  textSec:      '#7A90B8',   // secondary, labels
  muted:        '#3A4A66',   // disabled, placeholder
  mutedHi:      '#5A70A0',   // slightly more visible muted

  // Typography
  head:  "'Bebas Neue', 'Barlow Condensed', sans-serif",
  body:  "'Barlow Condensed', 'Inter', sans-serif",
  mono:  "'JetBrains Mono', 'Cascadia Code', monospace",

  // Geometry — sharp, not rounded
  radius:    '0px',          // default border radius: ZERO
  radiusSm:  '2px',          // only for tiny inline elements (tags, badges)
  radiusMd:  '0px',          // cards, panels: sharp corners
}

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
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
  .shimmer-block { background: linear-gradient(90deg, ${C.raised} 25%, #0A1428 50%, ${C.raised} 75%);
    background-size: 600px 100%; animation: shimmer 1.6s infinite linear; border-radius: 0; }
`

export function Label({ children, muted, style: sx = {} }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase',
      color: muted ? C.muted : C.textSec, marginBottom: 6, fontFamily: C.body, ...sx }}>
      {children}
    </div>
  )
}

export function Tag({ children, color = C.blue, size = 'sm' }) {
  return (
    <span style={{ fontSize: size === 'xs' ? 8 : 9, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase', color, border: `1px solid ${color}`, borderRadius: C.radiusSm,
      padding: '2px 6px', fontFamily: C.mono, flexShrink: 0, whiteSpace: 'nowrap' }}>
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
    primary: { background: C.blue, color: C.whiteHot, border: `1px solid ${C.blueDim}`, borderLeft: '2px solid #0088FF' },
    ghost:   { background: 'transparent', color: C.textPrimary, border: `1px solid ${C.border}` },
    danger:  { background: 'transparent', color: C.red, border: `1px solid ${C.redDim}` },
    subtle:  { background: C.raised, color: C.textSec, border: `1px solid ${C.border}` },
    success: { background: 'transparent', color: C.green, border: `1px solid ${C.greenDim}` },
  }
  const hoverIn = {
    primary: e => { e.currentTarget.style.background = '#0055EE'; e.currentTarget.style.boxShadow = `0 0 12px ${C.blueGlow}44` },
    ghost:   e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.blue },
    danger:  e => { e.currentTarget.style.background = `${C.red}15`; e.currentTarget.style.borderColor = C.red },
    subtle:  e => { e.currentTarget.style.borderColor = C.borderHi },
    success: e => { e.currentTarget.style.background = `${C.green}15`; e.currentTarget.style.borderColor = C.green },
  }
  const hoverOut = {
    primary: e => { e.currentTarget.style.background = C.blue; e.currentTarget.style.boxShadow = 'none' },
    ghost:   e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textPrimary },
    danger:  e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = C.redDim },
    subtle:  e => { e.currentTarget.style.borderColor = C.border },
    success: e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = C.greenDim },
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ borderRadius: 0, fontFamily: C.body, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
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
        ...(accent ? { borderLeft: `2px solid ${accent}` } : {}),
        borderRadius: 0, padding: 18, cursor: onClick ? 'pointer' : 'default',
        boxShadow: `inset 2px 2px 0 0 ${C.borderHi}`,
        ...sx }}>
      {children}
    </div>
  )
}

export function SectionHead({ children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, color: C.textPrimary, textTransform: 'uppercase' }}>{children}</div>
      <div style={{ width: 40, height: 1, background: C.blue, marginTop: 4 }} />
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
        style={{ width: 36, height: 20, borderRadius: 2, background: value ? C.blue : C.border,
          position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 18 : 3, width: 14, height: 14,
          borderRadius: 1, background: value ? C.whiteHot : C.mutedHi, transition: 'left .2s' }} />
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
      style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`,
        borderBottom: `${focused ? 2 : 1}px solid ${focused ? C.blue : C.borderHi}`,
        borderRadius: 0, color: C.textPrimary, padding: '7px 10px', fontSize: 12,
        fontFamily: mono ? C.mono : C.body, outline: 'none', ...sx }} />
  )
}

export function Select({ value, onChange, options, style: sx = {} }) {
  const [focused, setFocused] = useState(false)
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`,
        borderBottom: `${focused ? 2 : 1}px solid ${focused ? C.blue : C.borderHi}`,
        borderRadius: 0, color: C.textPrimary, padding: '7px 24px 7px 10px', fontSize: 12, outline: 'none',
        cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpolyline points='0,0 5,6 10,0' stroke='%235A70A0' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
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
      background: filled ? C.blue : 'transparent',
      border: filled ? 'none' : `1px solid ${color}`,
      color: filled ? C.whiteHot : color,
      fontFamily: C.body, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
      fontSize: 13, padding: '10px 20px', borderRadius: 0,
      boxShadow: filled ? '0 4px 24px rgba(0,0,0,.5)' : 'none', zIndex: 9999, animation: 'fadeUp .2s ease' }}>
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
            <span style={{ background: 'transparent', border: `1px solid ${t.badge > 0 ? C.red : C.border}`,
              color: t.badge > 0 ? C.red : C.muted, borderRadius: 0,
              fontSize: 10, padding: '1px 6px', fontFamily: C.mono }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
