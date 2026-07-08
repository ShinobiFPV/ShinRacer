import { useEffect, useState } from 'react'

// Bridges to the main process's UDP listener on AC's LIVE_TELEMETRY port.
export function useTelemetry({ enabled, port = 9996 } = {}) {
  const [laps, setLaps] = useState([])
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let unsub = () => {}
    let cancelled = false

    ;(async () => {
      const res = await window.api.telemetry.start(port)
      if (cancelled) return
      setListening(!!res?.ok)
      unsub = window.api.telemetry.onLap((lap) => {
        setLaps(prev => [...prev, lap])
      })
    })()

    return () => {
      cancelled = true
      unsub()
      window.api.telemetry.stop()
      setListening(false)
    }
  }, [enabled, port])

  return { laps, listening }
}
