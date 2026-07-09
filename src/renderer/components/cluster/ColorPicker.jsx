import { useState } from 'react'
import { C } from '../primitives'

// 40 preset swatches, 5 per row × 8 rows, grouped by hue per the spec.
const SWATCHES = [
  '#050507', '#0A0C12', '#1C2233', '#252A32', '#3A4A66',
  '#0066FF', '#0044CC', '#003A99', '#1A3A6E', '#3D8EF0',
  '#FF1A1A', '#CC0000', '#990000', '#FF4444', '#FF6666',
  '#00CC44', '#009933', '#006622', '#00FF55', '#66FF99',
  '#FF6600', '#CC4400', '#FF8833', '#FFB366', '#FF4400',
  '#FFD700', '#CCAA00', '#FFE033', '#FFF066', '#FFCC00',
  '#8E44AD', '#6C3483', '#B05FD8', '#D499F0', '#5B2C6F',
  '#FFFFFF', '#E8F0FF', '#C0C8D8', '#8090A8', '#506070',
]

const HEX_RE = /^#?[0-9a-fA-F]{6}$/

// No external color-picker library — a hex input plus a fixed swatch grid,
// per the Phase 11 constraint. `allowNull` supports the widget configs
// (glowColor, glowOnColor, etc.) that are legitimately `null` ("no glow").
export default function ColorPicker({ label, value, onChange, allowNull }) {
  const [draft, setDraft] = useState(value || '')

  function commit(raw) {
    const v = raw.trim()
    if (!v && allowNull) { onChange(null); return }
    const withHash = v.startsWith('#') ? v : `#${v}`
    if (HEX_RE.test(withHash)) onChange(withHash.toLowerCase())
    else setDraft(value || '') // invalid — revert to last good value
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: C.textSec, marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, background: value || 'transparent', border: `1px solid ${C.border}`, flexShrink: 0,
          backgroundImage: value ? 'none' : 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%)',
          backgroundSize: '8px 8px' }} />
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value) }}
          placeholder={allowNull ? 'none' : '#0066ff'}
          style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.textPrimary,
            padding: '5px 8px', fontFamily: C.mono, fontSize: 12, outline: 'none', borderRadius: 0 }}
        />
        {value && (
          <div title="Glow preview" style={{
            width: 20, height: 20, background: value, flexShrink: 0,
            boxShadow: `0 0 4px ${value}, 0 0 8px ${value}`,
          }} />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
        {SWATCHES.map(sw => (
          <button
            key={sw}
            onClick={() => { setDraft(sw); onChange(sw) }}
            title={sw}
            style={{
              width: '100%', aspectRatio: '1', background: sw, border: value === sw ? `2px solid ${C.whiteHot}` : `1px solid ${C.border}`,
              cursor: 'pointer', padding: 0,
            }}
          />
        ))}
      </div>
      {allowNull && (
        <button onClick={() => { setDraft(''); onChange(null) }}
          style={{ marginTop: 6, fontSize: 10, color: C.muted, textDecoration: 'underline' }}>
          Clear (no glow)
        </button>
      )}
    </div>
  )
}
