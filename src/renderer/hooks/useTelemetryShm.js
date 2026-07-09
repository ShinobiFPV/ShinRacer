import { useEffect, useRef, useState } from 'react'
import { generateMockFrame } from '../lib/telemetryMock'

const TICK_MS = 60
const STALE_MS = 500 // no real frame within this window => demo mode

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
  const lastRealFrameAt = useRef(0)

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
    })

    const tick = setInterval(() => {
      if (Date.now() - lastRealFrameAt.current > STALE_MS) {
        setFrame(generateMockFrame(Date.now()))
        setIsDemo(true)
      }
    }, TICK_MS)

    return () => {
      cancelled = true
      unsub()
      clearInterval(tick)
      window.api.telemetry.shmStop()
    }
  }, [])

  const isLive = !isDemo && !!frame && frame.status && frame.status !== 'OFF'

  return { frame, isLive, isDemo, error }
}
