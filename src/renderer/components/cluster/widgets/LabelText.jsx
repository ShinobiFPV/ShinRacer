import { C } from '../../primitives'
import { FONT_FAMILY } from './shared'

export const DEFAULT_LABELTEXT_CONFIG = {
  text: 'LABEL', fontSize: 16, fontFamily: 'bebas', color: C.textPrimary,
  backgroundColor: 'transparent', textAlign: 'center', letterSpacing: 1,
}

// Static text label — no input, no telemetry.
export default function LabelText({ config = {} }) {
  const cfg = { ...DEFAULT_LABELTEXT_CONFIG, ...config }
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: cfg.textAlign === 'left' ? 'flex-start' : cfg.textAlign === 'right' ? 'flex-end' : 'center',
      background: cfg.backgroundColor, padding: '0 6px', overflow: 'hidden',
    }}>
      <span style={{
        fontFamily: FONT_FAMILY[cfg.fontFamily] || C.body, fontSize: cfg.fontSize, color: cfg.color,
        letterSpacing: cfg.letterSpacing, textAlign: cfg.textAlign, whiteSpace: 'nowrap',
      }}>
        {cfg.text}
      </span>
    </div>
  )
}
