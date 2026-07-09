import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getBackendUrl, onBackendUrlChange } from '../lib/api'

// One socket connection per app session (module-level singleton) — same
// pattern as the Electron app's hook, so switching tabs/pages doesn't tear
// down and reconnect.
let singletonSocket = null
let singletonUrl = null

function getSharedSocket() {
  const url = getBackendUrl()
  if (!singletonSocket || singletonUrl !== url) {
    singletonSocket?.disconnect()
    singletonSocket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })
    singletonUrl = url
  }
  return singletonSocket
}

export function useSocket(identity) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => {
    if (!identity?.handle) return

    const attach = (s) => {
      const announce = () => {
        setConnected(true)
        s.emit('presence:join', { handle: identity.handle, color: identity.color })
      }
      const onDisconnect = () => setConnected(false)
      const onUsers = (list) => setUsers(list)

      s.on('connect', announce)
      s.on('disconnect', onDisconnect)
      s.on('presence:list', onUsers)
      if (s.connected) announce()

      return () => {
        s.off('connect', announce)
        s.off('disconnect', onDisconnect)
        s.off('presence:list', onUsers)
      }
    }

    let detach = null
    const mount = () => {
      const s = getSharedSocket()
      setSocket(s)
      setConnected(s.connected)
      detach = attach(s)
    }
    mount()

    const unsubUrl = onBackendUrlChange(() => {
      detach?.()
      mount()
    })

    return () => {
      detach?.()
      unsubUrl()
    }
  }, [identity?.handle, identity?.color])

  return { socket, connected, users }
}
