import { C } from '../../../lib/colors'
import { getTelemetryValue, formatTelemetryValue, FONT_FAMILY } from './shared'

export const DEFAULT_TEXTREADOUT_CONFIG = {
  telemetryBind: 'speed', format: 'number', prefix: '', suffix: '',
  fontSize: 28, fontFamily: 'title', color: C.textPrimary, backgroundColor: 'transparent', cornerRadius: 0,
  textAlign: 'center', decimals: 0,
}

export default function TextReadout({ config = {}, telemetryFrame }) {
  const cfg = { ...DEFAULT_TEXTREADOUT_CONFIG, ...config }
  const raw = getTelemetryValue(telemetryFrame, cfg.telemetryBind, null)
  const display = raw == null ? '--' : formatTelemetryValue(raw, cfg.format, cfg.decimals)
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: cfg.textAlign === 'left' ? 'flex-start' : cfg.textAlign === 'right' ? 'flex-end' : 'center',
      background: cfg.backgroundColor, borderRadius: cfg.cornerRadius, padding: '0 8px', overflow: 'hidden',
    }}>
      <span style={{ fontFamily: FONT_FAMILY[cfg.fontFamily] || C.body, fontSize: cfg.fontSize, color: cfg.color, whiteSpace: 'nowrap' }}>
        {cfg.prefix}{display}{cfg.suffix}
      </span>
    </div>
  )
}
