import { C } from '../lib/colors'

// Touch-first primitives — not a port of the Electron design system's
// components, just the same tokens/shape language applied to mobile:
// minimum 44×44px touch targets, sharp corners, bottom-sheet modals instead
// of hover-driven panels.

export function Btn({ children, onClick, variant = 'primary', size = 'md', full, style, disabled, type = 'button' }) {
  const base = {
    primary: { background: C.blue, color: C.whiteHot, border: `1px solid ${C.blue}` },
    outline: { background: 'transparent', color: C.blue, border: `1px solid ${C.blue}` },
    ghost:   { background: 'transparent', color: C.textSec, border: `1px solid ${C.border}` },
    danger:  { background: 'transparent', color: C.red, border: `1px solid ${C.red}` },
  }[variant]
  const height = size === 'lg' ? 56 : size === 'sm' ? 40 : 48
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        height,
        width: full ? '100%' : undefined,
        padding: '0 20px',
        fontFamily: C.body,
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: 0.3,
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function Card({ children, accent, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderLeft: accent ? `3px solid ${accent}` : `1px solid ${C.border}`,
        padding: 14,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Label({ children, style }) {
  return (
    <div style={{ fontFamily: C.body, fontWeight: 600, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.textSec, marginBottom: 6, ...style }}>
      {children}
    </div>
  )
}

export function PageTitle({ children, style }) {
  return (
    <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 1, ...style }}>
      {children}
    </div>
  )
}

export function SectionHead({ children, style }) {
  return (
    <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 1, marginBottom: 8, ...style }}>
      {children}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder, type = 'text', style, ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        minHeight: 44,
        background: C.raised,
        border: `1px solid ${C.border}`,
        color: C.textPrimary,
        fontFamily: C.body,
        fontSize: 15,
        padding: '0 12px',
        ...style,
      }}
      {...rest}
    />
  )
}

export function Chip({ children, active, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        minHeight: 36,
        padding: '0 14px',
        background: active ? C.blue : 'transparent',
        color: active ? C.whiteHot : C.textSec,
        border: `1px solid ${active ? C.blue : C.border}`,
        fontFamily: C.body,
        fontWeight: 600,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function StatusTag({ children, color }) {
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: C.body,
      fontWeight: 600,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color,
      border: `1px solid ${color}`,
      padding: '2px 8px',
    }}>
      {children}
    </span>
  )
}

// Slides up from the bottom, 80% viewport height — the mobile stand-in for
// the Electron app's slide-in detail panels / forms.
export function BottomSheet({ open, onClose, children, title }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', height: '80vh',
          background: C.surface,
          borderTop: `1px solid ${C.borderHi}`,
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 1 }}>{title}</div>
          <button onClick={onClose} style={{ minWidth: 44, minHeight: 44, fontSize: 22, color: C.textSec }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
      </div>
    </div>
  )
}

export function FAB({ onClick, children = '+', style }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(76px + env(safe-area-inset-bottom))',
        width: 56, height: 56,
        borderRadius: '50%',
        background: C.blue,
        color: C.whiteHot,
        fontSize: 26,
        boxShadow: `0 4px 16px ${C.blueGlow}88`,
        zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function EmptyState({ emoji, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{emoji}</div>
      <div style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, color: C.textSec, marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: C.muted }}>{subtitle}</div>}
    </div>
  )
}

export function OfflineBanner({ show }) {
  if (!show) return null
  return (
    <div style={{
      background: `${C.orange}18`,
      border: `1px solid ${C.orange}60`,
      color: C.orange,
      padding: '10px 14px',
      fontSize: 13,
      margin: '0 16px 12px',
    }}>
      Backend unreachable — check Tailscale and try again.
    </div>
  )
}
