import { useRef, useState } from 'react'
import { C } from '../../primitives'
import { glowShadow, SHAPE_CLIP, FONT_FAMILY, isRuntime } from './shared'

export const DEFAULT_MOMENTARY_CONFIG = {
  label: 'BUTTON', sublabel: '', fontSize: 14, fontFamily: 'title', shape: 'rectangle', cornerRadius: 0,
  fillColor: C.raised, borderColor: C.border, borderWidth: 1, labelColor: C.textPrimary,
  glowColor: null, glowIntensity: 0.6, image: null, imageOpacity: 1,
  pressedFillColor: C.blueDim, pressedGlowColor: C.blue,
  action: { type: 'none' },
}

// A button active only while held — mousedown/touchstart fires onPress,
// mouseup/touchend/mouseleave fires onRelease. `repeatOnHold` runs its own
// interval internally (this is the only place that knows it's "held").
export default function MomentaryButton({ config = {}, mode, width, height, onPress, onRelease }) {
  const cfg = { ...DEFAULT_MOMENTARY_CONFIG, ...config }
  const [pressed, setPressed] = useState(false)
  const repeatRef = useRef(null)

  function start() {
    if (!isRuntime(mode)) return
    setPressed(true)
    onPress?.()
    if (cfg.action?.repeatOnHold) {
      repeatRef.current = setInterval(() => onPress?.(), Math.max(30, cfg.action.repeatInterval || 100))
    }
  }
  function end() {
    if (!isRuntime(mode)) return
    if (!pressed) return
    setPressed(false)
    onRelease?.()
    if (repeatRef.current) { clearInterval(repeatRef.current); repeatRef.current = null }
  }

  const fill = pressed ? cfg.pressedFillColor : cfg.fillColor
  const glow = pressed ? (cfg.pressedGlowColor ?? cfg.glowColor) : cfg.glowColor

  return (
    <div
      onMouseDown={start} onMouseUp={end} onMouseLeave={end}
      onTouchStart={e => { e.preventDefault(); start() }} onTouchEnd={e => { e.preventDefault(); end() }}
      style={{
        width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: fill,
        border: `${cfg.borderWidth}px solid ${cfg.borderColor}`,
        clipPath: SHAPE_CLIP[cfg.shape] || 'none',
        borderRadius: cfg.shape === 'rectangle' ? cfg.cornerRadius : 0,
        boxShadow: glowShadow(glow, cfg.glowIntensity),
        cursor: isRuntime(mode) ? 'pointer' : 'default',
        transition: 'background .05s, box-shadow .1s',
        backgroundImage: cfg.image ? `url(${cfg.image})` : 'none',
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}
    >
      {cfg.image && <div style={{ position: 'absolute', inset: 0, background: fill, opacity: 1 - cfg.imageOpacity }} />}
      <span style={{
        position: 'relative', fontFamily: FONT_FAMILY[cfg.fontFamily] || C.head, fontSize: cfg.fontSize, color: cfg.labelColor,
        letterSpacing: 1, textAlign: 'center', lineHeight: 1.1, padding: '0 4px',
        transform: pressed ? 'translateY(1px)' : 'none', pointerEvents: 'none',
      }}>
        {cfg.label}
      </span>
      {cfg.sublabel && (
        <span style={{ position: 'relative', fontFamily: C.body, fontSize: Math.max(9, cfg.fontSize * 0.55), color: cfg.labelColor,
          opacity: 0.7, marginTop: 2, pointerEvents: 'none' }}>
          {cfg.sublabel}
        </span>
      )}
    </div>
  )
}
