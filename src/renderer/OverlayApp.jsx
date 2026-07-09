import { useEffect, useState } from 'react'
import { C, GLOBAL_CSS } from './components/primitives'
import { useTelemetryShm } from './hooks/useTelemetryShm'
import { WIDGET_CATALOG } from './components/telemetry/widgets'
import { PRESETS } from './views/TelemetryView'

const api = window.api

// Each overlay widget gets its own semi-transparent card so it reads clearly
// against whatever's behind the (fully transparent) overlay window — the
// window's own opacity, set via overlayWindow.setOpacity() in main.js,
// applies uniformly on top of this.
function OverlayWidget({ item, frame }) {
  const entry = WIDGET_CATALOG.find(w => w.id === item.id)
  if (!entry) return null
  const Component = entry.component
  return (
    <div style={{ background: 'rgba(5, 5, 7, 0.75)', border: '1px solid rgba(28, 34, 51, 0.8)', borderRadius: 0,
      padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Component frame={frame} config={item.config} />
    </div>
  )
}

// Renders when the window is loaded with a #overlay hash (see App.jsx) — the
// same Electron app, a different route. No sidebar/header/store provider,
// just the active preset's widgets on a transparent background.
export default function OverlayApp() {
  const { frame } = useTelemetryShm()
  const [presetId, setPresetId] = useState('minimal')

  useEffect(() => {
    api.store.get('overlayConfig').then(saved => { if (saved?.presetId) setPresetId(saved.presetId) })
  }, [])

  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[PRESETS.length - 1]

  const showContextMenu = (e) => {
    e.preventDefault()
    api.telemetry.showOverlayContextMenu()
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: '100vw', height: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div onContextMenu={showContextMenu}
          style={{ height: 8, background: `${C.bg}99`, WebkitAppRegion: 'drag', flexShrink: 0, cursor: 'move' }} />
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8, overflow: 'hidden' }}>
          {preset.widgets.map((item, idx) => <OverlayWidget key={`${item.id}_${idx}`} item={item} frame={frame} />)}
        </div>
      </div>
    </>
  )
}
