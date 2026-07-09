import { useState } from 'react'

export const C = {
  bg:        '#0D0F12',
  surface:   '#13161A',
  raised:    '#1A1E24',
  border:    '#252A32',
  borderHi:  '#353D47',
  yellow:    '#F5C518',
  yellowDim: '#8A6E0D',
  blue:      '#3D8EF0',
  green:     '#27AE60',
  red:       '#E74C3C',
  orange:    '#E67E22',
  purple:    '#8E44AD',
  white:     '#E8ECF0',
  muted:     '#5A6475',
  mutedHi:   '#7A8599',
  mono:      "'JetBrains Mono', 'Cascadia Code', monospace",
  head:      "'Rajdhani', sans-serif",
  body:      "'Inter', sans-serif",
}

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; background: ${C.bg}; color: ${C.white}; font-family: ${C.body}; overflow: hidden; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
  input, select, textarea { font-family: ${C.body}; }
  input[type=range] { accent-color: ${C.yellow}; cursor: pointer; }
  input[type=checkbox] { accent-color: ${C.yellow}; cursor: pointer; width: 14px; height: 14px; }
  select option { background: ${C.raised}; }
  button { cursor: pointer; font-family: ${C.body}; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
  @keyframes speakPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.3); } }
  @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
  .shimmer-block { background: linear-gradient(90deg, ${C.raised} 25%, ${C.border} 37%, ${C.raised} 63%);
    background-size: 600px 100%; animation: shimmer 1.6s infinite linear; border-radius: 4px; }
`

export function Label({ children, muted, style: sx = {} }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase',
      color: muted ? C.muted : C.mutedHi, marginBottom: 6, fontFamily: C.head, ...sx }}>
      {children}
    </div>
  )
}

export function Tag({ children, color = C.yellow, size = 'sm' }) {
  return (
    <span style={{ fontSize: size === 'xs' ? 9 : 10, fontWeight: 700, letterSpacing: 0.8,
      textTransform: 'uppercase', color, border: `1px solid ${color}`, borderRadius: 3,
      padding: '1px 5px', fontFamily: C.mono, flexShrink: 0, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style: sx = {}, title }) {
  const sizes = {
    xs: { fontSize: 11, padding: '3px 8px' },
    sm: { fontSize: 12, padding: '5px 12px' },
    md: { fontSize: 13, padding: '7px 18px' },
    lg: { fontSize: 15, padding: '9px 24px' },
  }
  const vars = {
    primary: { background: C.yellow, color: '#000', border: 'none' },
    ghost:   { background: 'transparent', color: C.white, border: `1px solid ${C.border}` },
    danger:  { background: C.red, color: '#fff', border: 'none' },
    subtle:  { background: C.raised, color: C.white, border: `1px solid ${C.border}` },
    success: { background: C.green, color: '#fff', border: 'none' },
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ borderRadius: 5, fontFamily: C.head, fontWeight: 700, letterSpacing: 0.4,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        transition: 'opacity .15s, transform .1s', ...sizes[size], ...vars[variant], ...sx }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.8' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '1' }}>
      {children}
    </button>
  )
}

export function Card({ children, style: sx = {}, accent, onClick, onMouseEnter, onMouseLeave }) {
  return (
    <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{ background: C.surface, border: `1px solid ${accent || C.border}`,
        borderRadius: 8, padding: 18, cursor: onClick ? 'pointer' : 'default', ...sx }}>
      {children}
    </div>
  )
}

export function SectionHead({ children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>{children}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 0.01, format, onChange, color = C.yellow, hint }) {
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
        style={{ width: 36, height: 20, borderRadius: 10, background: value ? C.yellow : C.border,
          position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 18 : 3, width: 14, height: 14,
          borderRadius: '50%', background: value ? '#000' : C.mutedHi, transition: 'left .2s' }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
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
      style={{ width: '100%', background: C.bg, border: `1px solid ${focused ? C.yellow : C.border}`,
        borderRadius: 5, color: C.white, padding: '7px 10px', fontSize: 12,
        fontFamily: mono ? C.mono : C.body, outline: 'none', ...sx }} />
  )
}

export function Select({ value, onChange, options, style: sx = {} }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 5, color: C.white, padding: '7px 10px', fontSize: 12, outline: 'none',
        cursor: 'pointer', ...sx }}>
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
      boxShadow: online ? `0 0 6px ${C.green}88` : 'none',
      animation: online ? 'none' : 'pulse 2s infinite' }} />
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

export function Toast({ msg, color = C.green, onDone }) {
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, background: color, color: color === C.green ? '#000' : '#fff',
      fontFamily: C.head, fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,.5)', zIndex: 9999, animation: 'fadeUp .2s ease' }}>
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
            color: active === t.id ? C.yellow : C.muted, fontFamily: C.head, fontWeight: 700,
            fontSize: 14, letterSpacing: 0.3, borderBottom: `2px solid ${active === t.id ? C.yellow : 'transparent'}`,
            marginBottom: -1, cursor: 'pointer', transition: 'color .15s',
            display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.icon && <span>{t.icon}</span>}
          {t.label}
          {t.badge != null && (
            <span style={{ background: t.badge > 0 ? C.red : C.border, color: '#fff', borderRadius: 10,
              fontSize: 10, padding: '1px 6px', fontFamily: C.mono }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
