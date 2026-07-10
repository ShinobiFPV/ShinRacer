import { useState, useEffect } from 'react'
import httpApi from '../lib/api'
import { useSocket } from './useSocket'

const api = window.api
const STALE_MS = 5000

// Local player's own position (from telemetry) + every other broadcasting
// crew member's position (via the backend's forza:position relay) for the
// Forza World Map. `identity` is required — passed straight through to
// useSocket, which needs it to announce presence.
//
// Deviation from the brief's own draft: its example called `useSocket()`
// (with no identity argument, and no top-level import) *inside* a
// useEffect — both a rules-of-hooks violation (hooks can't be called
// conditionally/nested inside an effect) and a signature mismatch with the
// real useSocket(identity). Fixed by calling useSocket(identity) at this
// hook's own top level, same as every other view that needs the shared
// socket connection.
export function useForza(identity) {
  const [myPosition, setMyPosition] = useState(null)
  const [activeGame, setActiveGame] = useState(null)
  const [players, setPlayers] = useState({}) // { handle: playerData }
  const { socket } = useSocket(identity)

  // Local position, straight from the existing telemetry frame stream —
  // no separate UDP listener needed.
  useEffect(() => {
    const unsub = api.telemetry.onFrame(frame => {
      if (frame.game === 'fh5' || frame.game === 'fh6') {
        setActiveGame(frame.game)
        setMyPosition({
          x: frame.worldPosition?.x,
          z: frame.worldPosition?.z,
          speed: frame.speed,
          isRacing: frame.isRacing,
          heading: frame.yaw || 0,
          game: frame.game,
        })
      }
    })
    return unsub
  }, [])

  // Other players, via the backend relay.
  useEffect(() => {
    if (!socket) return

    httpApi.get('/api/telemetry/forza-positions').then(res => {
      if (res.data?.ok) {
        const map = {}
        res.data.data.forEach(p => { map[p.handle] = p })
        setPlayers(map)
      }
    }).catch(() => {})

    const onPosition = (data) => {
      setPlayers(prev => ({ ...prev, [data.handle]: { ...data, ts: Date.now() } }))
    }
    socket.on('forza:position', onPosition)

    const cleanup = setInterval(() => {
      setPlayers(prev => {
        const now = Date.now()
        let changed = false
        const next = {}
        for (const [h, p] of Object.entries(prev)) {
          if (now - p.ts < STALE_MS) next[h] = p
          else changed = true
        }
        return changed ? next : prev
      })
    }, 3000)

    return () => {
      socket.off('forza:position', onPosition)
      clearInterval(cleanup)
    }
  }, [socket])

  return { myPosition, players, activeGame }
}
