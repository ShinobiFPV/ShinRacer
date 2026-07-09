import { useState } from 'react'
import { C } from '../../primitives'
import { glowShadow, isRuntime } from './shared'

export const DEFAULT_SWITCH_CONFIG = {
  orientation: 'horizontal', fillColor: C.textSec, glowColor: C.blue,
  glowIntensity: 0.6, action: { type: 'none' },
}

// A physical rocker/toggle look, SVG-rendered — momentary, same press/release
// interaction model as MomentaryButton (not a persistent toggle), just a
// different visual: "same action bindings as MomentaryButton" in the spec
// means a single `action`, fired on press and released on release, not the
// on/off action pair ToggleButton has.
export default function MomentarySwitch({ config = {}, mode, onPress, onRelease }) {
  const cfg = { ...DEFAULT_SWITCH_CONFIG, ...config }
  const [active, setActive] = useState(false)
  const horizontal = cfg.orientation !== 'vertical'

  function start() { if (!isRuntime(mode)) return; setActive(true); onPress?.() }
  function end() { if (!isRuntime(mode)) return; if (!active) return; setActive(false); onRelease?.() }

  const trackW = horizontal ? 70 : 30
  const trackH = horizontal ? 30 : 70
  const thumbR = 12
  const travel = (horizontal ? trackW : trackH) - thumbR * 2 - 4
  const thumbPos = active ? travel : 0

  return (
    <div
      onMouseDown={start} onMouseUp={end} onMouseLeave={end}
      onTouchStart={e => { e.preventDefault(); start() }} onTouchEnd={e => { e.preventDefault(); end() }}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isRuntime(mode) ? 'pointer' : 'default' }}
    >
      <svg width={trackW} height={trackH} style={{ overflow: 'visible' }}>
        <rect x={0} y={0} width={trackW} height={trackH} rx={trackH / 2} ry={trackW / 2} fill={C.bg} stroke={C.border} strokeWidth={2} />
        <circle
          cx={horizontal ? 2 + thumbR + thumbPos : trackW / 2}
          cy={horizontal ? trackH / 2 : 2 + thumbR + thumbPos}
          r={thumbR}
          fill={active ? cfg.glowColor : cfg.fillColor}
          style={{ transition: 'cx .12s, cy .12s, fill .12s', filter: active ? `drop-shadow(${glowShadow(cfg.glowColor, cfg.glowIntensity).split(',')[0]})` : 'none' }}
        />
      </svg>
    </div>
  )
}
