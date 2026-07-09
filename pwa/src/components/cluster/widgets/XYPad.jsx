import { useRef } from 'react'
import { C } from '../../../lib/colors'
import { isRuntime } from './shared'

export const DEFAULT_XYPAD_CONFIG = {
  backgroundColor: C.bg, crosshairColor: C.blue, label: 'XY PAD',
  actionX: { type: 'none' }, actionY: { type: 'none' }, gridLines: true,
}

export default function XYPad({ config = {}, mode, value, onValueChange }) {
  const cfg = { ...DEFAULT_XYPAD_CONFIG, ...config }
  const padRef = useRef(null)
  const pos = value || { x: 0.5, y: 0.5 }

  function fromPoint(clientX, clientY) {
    const rect = padRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return { x, y }
  }
  function drag(clientX, clientY) {
    if (!isRuntime(mode)) return
    onValueChange?.(fromPoint(clientX, clientY))
  }
  function onMouseDown(e) {
    if (!isRuntime(mode)) return
    drag(e.clientX, e.clientY)
    const onMove = (ev) => drag(ev.clientX, ev.clientY)
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {cfg.label && <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>{cfg.label}</span>}
      <div
        ref={padRef}
        onMouseDown={onMouseDown}
        onTouchStart={e => drag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => drag(e.touches[0].clientX, e.touches[0].clientY)}
        style={{ position: 'relative', flex: 1, background: cfg.backgroundColor, border: `1px solid ${C.border}`, cursor: isRuntime(mode) ? 'crosshair' : 'default', overflow: 'hidden', touchAction: 'none' }}
      >
        {cfg.gridLines && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            {[0.25, 0.5, 0.75].map(f => (
              <g key={f}>
                <line x1={`${f * 100}%`} y1="0" x2={`${f * 100}%`} y2="100%" stroke={C.border} strokeWidth={0.5} opacity={0.5} />
                <line x1="0" y1={`${f * 100}%`} x2="100%" y2={`${f * 100}%`} stroke={C.border} strokeWidth={0.5} opacity={0.5} />
              </g>
            ))}
          </svg>
        )}
        <div style={{
          position: 'absolute', left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: 'translate(-50%, -50%)',
          width: 20, height: 20, borderRadius: '50%', border: `2px solid ${cfg.crosshairColor}`, background: `${cfg.crosshairColor}33`,
        }} />
      </div>
    </div>
  )
}
