import { useState } from 'react'
import { C } from '../primitives'
import { getWidgetEntry, STATEFUL_WIDGET_TYPES } from './widgets'

// Renders a ClusterLayout in runtime mode — used by the Electron overlay
// window, the PWA's ClusterPage, and the editor's PREVIEW mode. Owns the
// runtime state map for widget types whose value has to persist across
// re-renders but isn't part of the (static, author-set) config: toggle
// on/off, rotary position, slider value, XY pad position. See widgets/
// index.js's STATEFUL_WIDGET_TYPES comment for why this couldn't just live
// in each widget's own local useState.
export default function ClusterRuntime({ layout, telemetryFrame, onAction, mode = 'runtime' }) {
  const [runtimeState, setRuntimeState] = useState(() => {
    const initial = {}
    for (const w of layout?.widgets || []) {
      if (w.type === 'toggleButton') initial[w.id] = w.config?.defaultState === 'on'
      else if (w.type === 'slider') initial[w.id] = w.config?.defaultValue ?? w.config?.minValue ?? 0
      else if (w.type === 'rotaryEncoder') initial[w.id] = w.config?.minValue ?? 0
      else if (w.type === 'xyPad') initial[w.id] = { x: 0.5, y: 0.5 }
    }
    return initial
  })

  if (!layout) return null

  function setValue(widgetId, value) {
    setRuntimeState(prev => ({ ...prev, [widgetId]: value }))
  }

  function fire(widgetId, action, event, value) {
    if (!action || action.type === 'none') return
    onAction?.({ widgetId, action, event, value })
  }

  return (
    <div style={{
      position: 'relative', width: layout.canvasWidth, height: layout.canvasHeight,
      background: layout.backgroundColor || C.bg,
      backgroundImage: layout.backgroundImage ? `url(${layout.backgroundImage})` : 'none',
      backgroundSize: 'cover', backgroundPosition: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {layout.backgroundImage && layout.backgroundImageOpacity != null && layout.backgroundImageOpacity < 1 && (
        <div style={{ position: 'absolute', inset: 0, background: layout.backgroundColor || C.bg, opacity: 1 - layout.backgroundImageOpacity }} />
      )}
      {[...(layout.widgets || [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(w => {
        const entry = getWidgetEntry(w.type)
        if (!entry) return null
        const Widget = entry.component
        const cfg = w.config || {}
        const common = { key: w.id, config: cfg, mode, telemetryFrame }

        let extra = {}
        switch (w.type) {
          case 'momentaryButton':
            extra = { onPress: () => fire(w.id, cfg.action, 'press'), onRelease: () => fire(w.id, cfg.action, 'release') }
            break
          case 'toggleButton':
            extra = {
              value: runtimeState[w.id],
              onValueChange: (v) => setValue(w.id, v),
              onPress: (action) => fire(w.id, action, 'press', runtimeState[w.id]),
            }
            break
          case 'momentarySwitch':
            extra = { onPress: () => fire(w.id, cfg.action, 'press'), onRelease: () => fire(w.id, cfg.action, 'release') }
            break
          case 'rotaryEncoder':
            extra = {
              value: runtimeState[w.id],
              onValueChange: (v) => setValue(w.id, v),
              onPress: (action) => fire(w.id, action, 'press', runtimeState[w.id]),
            }
            break
          case 'slider':
            extra = {
              value: runtimeState[w.id],
              onValueChange: (v) => { setValue(w.id, v); fire(w.id, cfg.actionOnChange, 'change', v) },
            }
            break
          case 'xyPad':
            extra = {
              value: runtimeState[w.id],
              onValueChange: (pos) => {
                setValue(w.id, pos)
                fire(w.id, cfg.actionX, 'change', pos.x)
                fire(w.id, cfg.actionY, 'change', pos.y)
              },
            }
            break
          default:
            extra = {}
        }

        return (
          <div key={w.id} style={{ position: 'absolute', left: w.x, top: w.y, width: w.width, height: w.height, zIndex: w.zIndex ?? 0 }}>
            <Widget {...common} width={w.width} height={w.height} {...extra} />
          </div>
        )
      })}
    </div>
  )
}
