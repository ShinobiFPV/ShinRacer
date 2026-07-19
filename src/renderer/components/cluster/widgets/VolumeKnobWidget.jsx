import { useRef } from 'react'
import { C } from '../../primitives'
import { isRuntime } from './shared'

export const DEFAULT_VOLUMEKNOB_CONFIG = {
  channel: 'music', knobColor: C.blue, glowColor: null, showValue: true, label: 'MUSIC',
}

// Single rotary knob pre-bound to one Car Stereo mixer channel — same visual
// language as the generic RotaryEncoder widget, but its value comes from
// stereoState.volumes[channel] instead of runtime state ClusterRuntime owns.
export default function VolumeKnobWidget({ config = {}, mode, stereoState, onVolumeChange }) {
  const cfg = { ...DEFAULT_VOLUMEKNOB_CONFIG, ...config }
  const dragRef = useRef(null)
  const runtime = isRuntime(mode)
  const value = cfg.channel === 'master'
    ? (stereoState?.volumes?.master ?? 100)
    : (stereoState?.muted?.[cfg.channel] ? 0 : (stereoState?.volumes?.[cfg.channel] ?? 0))

  function onMouseDown(e) {
    if (!runtime) return
    e.preventDefault()
    let last = e.clientY
    function move(ev) {
      const delta = last - ev.clientY
      last = ev.clientY
      const next = Math.max(0, Math.min(100, value + delta))
      onVolumeChange?.(cfg.channel, Math.round(next))
    }
    function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  function onWheel(e) {
    if (!runtime) return
    e.preventDefault()
    onVolumeChange?.(cfg.channel, Math.max(0, Math.min(100, value + (e.deltaY < 0 ? 2 : -2))))
  }

  const angle = -135 + (value / 100) * 270
  const size = 60, cx = size / 2, cy = size / 2, r = 22
  const end = { x: cx + r * Math.sin((angle * Math.PI) / 180), y: cy - r * Math.cos((angle * Math.PI) / 180) }

  return (
    <div ref={dragRef} onMouseDown={onMouseDown} onWheel={onWheel}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: runtime ? 'ns-resize' : 'default', userSelect: 'none' }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill={C.raised} stroke={C.border} strokeWidth={2} />
        <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={cfg.knobColor} strokeWidth={3} strokeLinecap="round"
          style={{ filter: cfg.glowColor ? `drop-shadow(0 0 3px ${cfg.glowColor})` : 'none' }} />
        {cfg.showValue && (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill={C.textPrimary} fontFamily={C.mono}>{Math.round(value)}</text>
        )}
      </svg>
      <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{cfg.label}</span>
    </div>
  )
}
