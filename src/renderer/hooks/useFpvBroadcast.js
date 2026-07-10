import { useEffect, useRef } from 'react'

const BROADCAST_MS = 200

// Broadcasts the local player's world position to other connected clients
// via the backend's fpv:position relay, for the FPV Drone Assistant's live
// map (AC's shared memory only ever exposes the LOCAL player's position —
// this is how other players' positions become visible at all). Only
// broadcasts real telemetry frames, never demo/mock data — matching
// useTelemetryShm's own "never mirror mock frames to the backend"
// convention, so idling on the FPV tab without AC running never pollutes
// the map with fake positions. Reads the latest frame via refs on a plain
// interval rather than re-subscribing an effect on every frame tick (frame
// updates at 60fps), which would otherwise tear down/recreate this timer
// far more often than the 200ms cadence actually needs.
export function useFpvBroadcast({ socket, identity, frame, isDemo }) {
  const frameRef = useRef(frame)
  const isDemoRef = useRef(isDemo)
  frameRef.current = frame
  isDemoRef.current = isDemo

  useEffect(() => {
    if (!socket || !identity?.handle) return
    const interval = setInterval(() => {
      if (isDemoRef.current) return
      const f = frameRef.current
      const pos = f?.worldPosition
      if (!pos || pos.x == null || pos.z == null) return
      socket.emit('fpv:position', { handle: identity.handle, x: pos.x, y: pos.y, z: pos.z, track: f.track })
    }, BROADCAST_MS)
    return () => clearInterval(interval)
  }, [socket, identity?.handle])
}
