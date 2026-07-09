import { useEffect, useRef, useState } from 'react'
import { generateMockFrame } from '../lib/telemetryMock'
import api from '../lib/api'

const TICK_MS = 60
const STALE_MS = 500 // no real frame within this window => demo mode
const BACKEND_POST_MS = 500 // Phase 11: mirrors live frames to the backend for the PWA's Cluster page

// Live telemetry from AC's Shared Memory API (physics/graphics/static),
// bridged from main.js's persistent PowerShell reader. Falls back to a local
// mock generator — silently, no user action needed — whenever a real frame
// hasn't arrived recently (AC not running, or the SHM bridge failed to start).
// This hook is for live display only; it never posts to the backend (that's
// the separate UDP-based useTelemetry hook used for lap-time history).
export function useTelemetryShm() {
  const [frame, setFrame] = useState(null)
  const [isDemo, setIsDemo] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const lastRealFrameAt = useRef(0)
  const lastPostedAt = useRef(0)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await window.api.telemetry.shmStart()
        if (!cancelled && !res?.ok) setError(res?.error || 'SHM_START_FAILED')
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    })()

    const unsub = window.api.telemetry.onFrame((data) => {
      lastRealFrameAt.current = Date.now()
      setFrame(data)
      setIsDemo(false)
      // Mirrors real (never demo/mock) frames to the backend at a throttled
      // rate — this is what lets the PWA's Cluster page show live telemetry
      // via GET /api/telemetry/latest without needing its own SHM access
      // (which a browser can't have). Best-effort: a slow/offline backend
      // should never affect the local live display.
      const now = Date.now()
      if (now - lastPostedAt.current >= BACKEND_POST_MS) {
        lastPostedAt.current = now
        api.post('/api/telemetry/frame', { frame: data }).catch(() => {})
      }
    })

    const tick = setInterval(() => {
      if (Date.now() - lastRealFrameAt.current > STALE_MS) {
        setFrame(generateMockFrame(Date.now()))
        setIsDemo(true)
      }
    }, TICK_MS)

    // AC Evo's shared-memory struct is early-access and can shift between
    // game patches — the source flags this per-frame (frame.parseError)
    // rather than only on a one-time version-change warning, but main.js
    // also surfaces the one-time version-change event itself here so the UI
    // can show a specific "why," not just a generic parse-error banner.
    const unsubWarning = window.api.telemetry.onWarning((message) => setWarning(message))

    return () => {
      cancelled = true
      unsub()
      unsubWarning()
      clearInterval(tick)
      window.api.telemetry.shmStop()
    }
  }, [])

  const isLive = !isDemo && !!frame && frame.status && frame.status !== 'OFF'

  return { frame, isLive, isDemo, error, warning }
}
