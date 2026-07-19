import { useRef } from 'react'
import { C } from '../../primitives'
import { getTelemetryValue, isRuntime } from './shared'

export const DEFAULT_ROTARY_CONFIG = {
  label: 'ENCODER', minValue: 0, maxValue: 10, steps: 11, wrapAround: false,
  fillColor: C.raised, markerColor: C.blue,
  actionCW: { type: 'none' }, actionCCW: { type: 'none' }, actionPress: { type: 'none' },
  showValue: true, telemetryBind: null,
}

// Click to fire actionPress; mouse wheel or a vertical touch-drag turns it
// (one detent per wheel tick / per ~12px of drag). `value` is the runtime
// state (owned by ClusterRuntime, same pattern as ToggleButton) unless
// telemetryBind is set, in which case the dial is read-only and just
// displays the live telemetry value — clicking it still fires actionPress.
export default function RotaryEncoder({ config = {}, mode, telemetryFrame, value, onValueChange, onPress }) {
  const cfg = { ...DEFAULT_ROTARY_CONFIG, ...config }
  const dragRef = useRef(null)
  const readOnly = !!cfg.telemetryBind
  const current = readOnly ? getTelemetryValue(telemetryFrame, cfg.telemetryBind, cfg.minValue) : (value ?? cfg.minValue)

  function step(dir) {
    if (readOnly || !isRuntime(mode)) return
    const stepSize = (cfg.maxValue - cfg.minValue) / Math.max(1, cfg.steps - 1)
    let next = current + dir * stepSize
    if (cfg.wrapAround) {
      const range = cfg.maxValue - cfg.minValue
      next = ((next - cfg.minValue + range) % range) + cfg.minValue
    } else {
      next = Math.max(cfg.minValue, Math.min(cfg.maxValue, next))
    }
    onValueChange?.(next)
    onPress?.(dir > 0 ? cfg.actionCW : cfg.actionCCW)
  }

  function onWheel(e) {
    if (!isRuntime(mode)) return
    e.preventDefault()
    step(e.deltaY < 0 ? 1 : -1)
  }
  function onTouchStart(e) { if (isRuntime(mode)) dragRef.current = e.touches[0].clientY }
  function onTouchMove(e) {
    if (!isRuntime(mode) || dragRef.current == null) return
    const y = e.touches[0].clientY
    const delta = dragRef.current - y
    if (Math.abs(delta) >= 12) { step(delta > 0 ? 1 : -1); dragRef.current = y }
  }
  function onClick() { if (isRuntime(mode)) onPress?.(cfg.actionPress) }

  const pct = Math.max(0, Math.min(1, (current - cfg.minValue) / Math.max(1e-6, cfg.maxValue - cfg.minValue)))
  const angle = -135 + pct * 270
  const size = 80, cx = size / 2, cy = size / 2, r = 32
  const markerEnd = { x: cx + r * Math.sin((angle * Math.PI) / 180), y: cy - r * Math.cos((angle * Math.PI) / 180) }

  return (
    <div
      onWheel={onWheel} onClick={onClick}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { dragRef.current = null }}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: isRuntime(mode) ? 'ns-resize' : 'default', userSelect: 'none' }}
    >
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill={cfg.fillColor} stroke={C.border} strokeWidth={2} />
        <line x1={cx} y1={cy} x2={markerEnd.x} y2={markerEnd.y} stroke={cfg.markerColor} strokeWidth={3} strokeLinecap="round" />
        {cfg.showValue && (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={13} fill={C.textPrimary} fontFamily={C.mono}>
            {Number.isInteger(current) ? current : current.toFixed(1)}
          </text>
        )}
      </svg>
      <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{cfg.label}</span>
    </div>
  )
}
