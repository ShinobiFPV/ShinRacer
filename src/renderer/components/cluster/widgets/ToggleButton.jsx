import { C } from '../../primitives'
import { glowShadow, SHAPE_CLIP, FONT_FAMILY, telemetryIsOn, isRuntime } from './shared'
import { DEFAULT_MOMENTARY_CONFIG } from './MomentaryButton'

export const DEFAULT_TOGGLE_CONFIG = {
  ...DEFAULT_MOMENTARY_CONFIG,
  label: 'TOGGLE',
  toggleOnFillColor: C.blue, toggleOnGlowColor: C.blue, toggleOnLabel: null,
  defaultState: 'off', telemetryBind: null,
  actionOn: { type: 'none' }, actionOff: { type: 'none' },
}

// Stays on/off between presses. State lives in the runtime state map owned
// by ClusterRuntime (`value`/`onValueChange`), not in config — this is what
// the spec means by "stored in cluster runtime state, not config": a widget
// instance's on/off state has to persist across re-renders and be readable
// by ClusterRuntime's own dispatch logic, which config (author-set, static)
// can't do. `telemetryFrame` + `telemetryBind`, when set, override the
// *displayed* state with the live telemetry reading — the button still
// toggles actionOn/actionOff on click either way.
export default function ToggleButton({ config = {}, mode, telemetryFrame, value, onValueChange, onPress }) {
  const cfg = { ...DEFAULT_TOGGLE_CONFIG, ...config }
  const isOn = cfg.telemetryBind ? telemetryIsOn(telemetryFrame, cfg.telemetryBind) : !!value

  function toggle() {
    if (!isRuntime(mode)) return
    const next = !isOn
    onValueChange?.(next)
    onPress?.(next ? cfg.actionOn : cfg.actionOff, next)
  }

  const fill = isOn ? cfg.toggleOnFillColor : cfg.fillColor
  const glow = isOn ? cfg.toggleOnGlowColor : cfg.glowColor
  const label = isOn && cfg.toggleOnLabel ? cfg.toggleOnLabel : cfg.label

  return (
    <div
      onClick={toggle}
      style={{
        width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: fill,
        border: `${cfg.borderWidth}px solid ${cfg.borderColor}`,
        clipPath: SHAPE_CLIP[cfg.shape] || 'none',
        borderRadius: cfg.shape === 'rectangle' ? cfg.cornerRadius : 0,
        boxShadow: glowShadow(glow, cfg.glowIntensity),
        cursor: isRuntime(mode) ? 'pointer' : 'default',
        transition: 'background .1s, box-shadow .15s',
      }}
    >
      <span style={{ fontFamily: FONT_FAMILY[cfg.fontFamily] || C.head, fontSize: cfg.fontSize, color: cfg.labelColor, letterSpacing: 1, textAlign: 'center', padding: '0 4px', pointerEvents: 'none' }}>
        {label}
      </span>
      {cfg.sublabel && (
        <span style={{ fontFamily: C.body, fontSize: Math.max(9, cfg.fontSize * 0.55), color: cfg.labelColor, opacity: 0.7, marginTop: 2, pointerEvents: 'none' }}>
          {cfg.sublabel}
        </span>
      )}
    </div>
  )
}
