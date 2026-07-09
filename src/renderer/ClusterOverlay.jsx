import { useEffect, useState } from 'react'
import { C, GLOBAL_CSS } from './components/primitives'
import { useTelemetryShm } from './hooks/useTelemetryShm'
import ClusterRuntime from './components/cluster/ClusterRuntime'

const api = window.api

// Renders when the window is loaded with a #cluster-overlay hash (see
// App.jsx) — same pattern as OverlayApp.jsx's #overlay route: a separate
// BrowserWindow, no sidebar/header/store provider, just the active preset
// on a transparent background with mouse/keyboard input wired live.
export default function ClusterOverlay() {
  const { frame } = useTelemetryShm()
  const [layout, setLayout] = useState(null)

  useEffect(() => {
    api.store.get('activeClusterOverlay').then(saved => { if (saved) setLayout(saved) })
  }, [])

  function handleAction({ action, event }) {
    if (!action || action.type === 'none') return
    if (action.type === 'keystroke') {
      // keyTap already simulates a full press+release; repeatOnHold fires
      // this repeatedly on its own (see MomentaryButton), so 'release'
      // events don't need a separate key-up call here.
      if (event === 'press' || event === 'change') api.cluster.sendKey(action.key)
    } else if (action.type === 'appFunction') {
      if (event === 'press' || event === 'change') api.cluster.callFn(action.fn, action.fnParam)
    }
  }

  const showContextMenu = (e) => {
    e.preventDefault()
    api.cluster.showOverlayContextMenu()
  }

  if (!layout) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, background: 'transparent' }}>
          Loading cluster…
        </div>
      </>
    )
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: '100vw', height: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div onContextMenu={showContextMenu}
          style={{ height: 8, background: `${C.bg}99`, WebkitAppRegion: 'drag', flexShrink: 0, cursor: 'move' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ClusterRuntime layout={layout} telemetryFrame={frame} onAction={handleAction} mode="runtime" />
        </div>
      </div>
    </>
  )
}
