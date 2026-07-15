import { C } from '../../../lib/colors'
import { glowShadow, telemetryIsOn } from './shared'

export const DEFAULT_INDICATOR_CONFIG = {
  shape: 'circle', size: 24, cornerRadius: 4, label: 'DRS', labelPosition: 'below',
  onColor: C.green, offColor: C.border, glowOnColor: C.green,
  telemetryBind: 'drs', telemetryThreshold: null,
}

export default function IndicatorLight({ config = {}, telemetryFrame }) {
  const cfg = { ...DEFAULT_INDICATOR_CONFIG, ...config }
  const on = telemetryIsOn(telemetryFrame, cfg.telemetryBind, cfg.telemetryThreshold)
  const color = on ? cfg.onColor : cfg.offColor
  const label = cfg.label && cfg.labelPosition !== 'none' && (
    <span style={{ fontFamily: C.body, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{cfg.label}</span>
  )
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {cfg.labelPosition === 'above' && label}
      <div style={{
        width: cfg.size, height: cfg.size, background: color,
        borderRadius: cfg.shape === 'circle' ? '50%' : cfg.cornerRadius,
        border: `1px solid ${C.border}`,
        boxShadow: on ? glowShadow(cfg.glowOnColor, 0.7) : 'none',
        transition: 'background .15s, box-shadow .15s',
      }} />
      {cfg.labelPosition === 'below' && label}
    </div>
  )
}
