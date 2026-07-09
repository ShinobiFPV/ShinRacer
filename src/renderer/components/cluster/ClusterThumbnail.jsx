import { C } from '../primitives'
import ClusterRuntime from './ClusterRuntime'

const THUMB_W = 200
const THUMB_H = 120

// A scaled-down, non-interactive preview for My Clusters / Public Library
// cards — reuses ClusterRuntime itself (rendered with telemetryFrame=null,
// so every telemetry-bound widget just shows its '--' fallback) rather than
// a separate canvas-API render, per the spec. `pointerEvents: 'none'` on the
// scaled wrapper is what actually makes it non-interactive — mode='runtime'
// is still used so widgets render their real (not edit-placeholder) look,
// but nothing can click through to fire an action from a thumbnail card.
export default function ClusterThumbnail({ layout }) {
  if (!layout) {
    return <div style={{ width: THUMB_W, height: THUMB_H, background: C.raised, border: `1px solid ${C.border}` }} />
  }
  const scale = Math.min(THUMB_W / layout.canvasWidth, THUMB_H / layout.canvasHeight)
  return (
    <div style={{ width: THUMB_W, height: THUMB_H, background: C.bg, border: `1px solid ${C.border}`, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center', pointerEvents: 'none',
      }}>
        <ClusterRuntime layout={layout} telemetryFrame={null} mode="runtime" onAction={() => {}} />
      </div>
    </div>
  )
}
