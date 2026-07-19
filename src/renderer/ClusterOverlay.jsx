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
  // Car Stereo (Phase 18): this window is a separate renderer with no access
  // to the main window's useStereo context (Spotify SDK / BrowserViews / Web
  // Audio graph all live there) — main.js mirrors a lightweight snapshot here
  // via 'stereo:state' (see useStereo.jsx's push effect + main.js's
  // 'stereo:pushState' handler). Actions round-trip back through the same
  // cluster:callFn -> cluster:invoke -> window CustomEvent path already used
  // for ptt/mute/volume, landing on useStereo's own listeners in the main window.
  const [stereoState, setStereoState] = useState(null)

  useEffect(() => {
    api.store.get('activeClusterOverlay').then(saved => { if (saved) setLayout(saved) })
  }, [])

  useEffect(() => api.stereo.onState(setStereoState), [])

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

  function handleStereoAction(action) { api.cluster.callFn(`stereo.${action}`) }
  function handleStereoVolumeChange(channel, value) { api.cluster.callFn('stereo.volumeSet', { channel, value }) }

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
          <ClusterRuntime layout={layout} telemetryFrame={frame} onAction={handleAction} mode="runtime"
            stereoState={stereoState} onStereoAction={handleStereoAction} onStereoVolumeChange={handleStereoVolumeChange} />
        </div>
      </div>
    </>
  )
}
