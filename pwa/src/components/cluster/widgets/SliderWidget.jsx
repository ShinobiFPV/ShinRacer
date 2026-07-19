import { useRef } from 'react'
import { C } from '../../../lib/colors'
import { getTelemetryValue, isRuntime } from './shared'

export const DEFAULT_SLIDER_CONFIG = {
  orientation: 'horizontal', minValue: 0, maxValue: 1, defaultValue: 0.5,
  trackColor: C.border, thumbColor: C.whiteHot, fillColor: C.blue,
  label: 'SLIDER', showValue: true, actionOnChange: { type: 'none' }, telemetryBind: null,
}

export default function SliderWidget({ config = {}, mode, telemetryFrame, value, onValueChange }) {
  const cfg = { ...DEFAULT_SLIDER_CONFIG, ...config }
  const trackRef = useRef(null)
  const horizontal = cfg.orientation !== 'vertical'
  const readOnly = !!cfg.telemetryBind
  const current = readOnly ? getTelemetryValue(telemetryFrame, cfg.telemetryBind, cfg.minValue) : (value ?? cfg.defaultValue)
  const pct = Math.max(0, Math.min(1, (current - cfg.minValue) / Math.max(1e-6, cfg.maxValue - cfg.minValue)))

  function valueFromPoint(clientX, clientY) {
    const rect = trackRef.current.getBoundingClientRect()
    let p
    if (horizontal) p = (clientX - rect.left) / rect.width
    else p = 1 - (clientY - rect.top) / rect.height
    p = Math.max(0, Math.min(1, p))
    return cfg.minValue + p * (cfg.maxValue - cfg.minValue)
  }

  function drag(clientX, clientY) {
    if (readOnly || !isRuntime(mode)) return
    onValueChange?.(valueFromPoint(clientX, clientY))
  }

  function onMouseDown(e) {
    if (readOnly || !isRuntime(mode)) return
    drag(e.clientX, e.clientY)
    const onMove = (ev) => drag(ev.clientX, ev.clientY)
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }}>
      {cfg.label && <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{cfg.label}</span>}
      <div
        ref={trackRef}
        onMouseDown={onMouseDown}
        onTouchStart={e => drag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => drag(e.touches[0].clientX, e.touches[0].clientY)}
        style={{
          position: 'relative', background: cfg.trackColor, cursor: readOnly ? 'default' : (isRuntime(mode) ? 'pointer' : 'default'),
          width: horizontal ? '100%' : 10, height: horizontal ? 10 : '100%', flex: horizontal ? 'none' : 1, touchAction: 'none',
        }}
      >
        <div style={{
          position: 'absolute', background: cfg.fillColor,
          ...(horizontal ? { left: 0, top: 0, bottom: 0, width: `${pct * 100}%` } : { left: 0, right: 0, bottom: 0, height: `${pct * 100}%` }),
        }} />
        <div style={{
          position: 'absolute', width: 22, height: 22, borderRadius: '50%', background: cfg.thumbColor,
          transform: 'translate(-50%, -50%)',
          left: horizontal ? `${pct * 100}%` : '50%',
          top: horizontal ? '50%' : `${(1 - pct) * 100}%`,
        }} />
      </div>
      {cfg.showValue && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textSec }}>{current.toFixed(2)}</span>}
    </div>
  )
}
