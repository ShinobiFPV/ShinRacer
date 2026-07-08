import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getBackendUrl } from '../lib/api'

// Connects to the backend, announces presence, and tracks who else is online.
export function useSocket(identity) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [presence, setPresence] = useState([])

  useEffect(() => {
    if (!identity?.handle) return

    const s = io(getBackendUrl(), {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    s.on('connect', () => {
      setConnected(true)
      s.emit('presence:join', { handle: identity.handle, color: identity.color })
    })
    s.on('disconnect', () => setConnected(false))
    s.on('presence:list', (list) => setPresence(list))
    s.on('presence:join', (user) => setPresence(prev => [...prev.filter(p => p.id !== user.id), user]))
    s.on('presence:leave', (user) => setPresence(prev => prev.filter(p => p.id !== user.id)))

    setSocket(s)

    return () => {
      s.disconnect()
      setSocket(null)
      setConnected(false)
      setPresence([])
    }
  }, [identity?.handle, identity?.color])

  return { socket, connected, presence }
}
