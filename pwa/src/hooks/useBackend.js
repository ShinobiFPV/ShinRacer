import { useEffect, useState } from 'react'
import api, { getBackendUrl, onBackendUrlChange } from '../lib/api'

export function useBackend() {
  const [backendUrl, setBackendUrlState] = useState(getBackendUrl())
  const [isOnline, setIsOnline] = useState(null) // null = not checked yet

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const { data } = await api.get('/api/health', { timeout: 4000 })
        if (!cancelled) setIsOnline(!!data.ok)
      } catch {
        if (!cancelled) setIsOnline(false)
      }
    }
    check()
    const interval = setInterval(check, 30000)
    const unsub = onBackendUrlChange((url) => { setBackendUrlState(url); check() })
    return () => { cancelled = true; clearInterval(interval); unsub() }
  }, [])

  return { backendUrl, isOnline }
}
