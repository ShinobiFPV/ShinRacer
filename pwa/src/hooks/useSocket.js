import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getBackendUrl, onBackendUrlChange } from '../lib/api'
import { getIdToken } from '../lib/auth'

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
      // Called fresh on every (re)connection attempt, so a token refreshed
      // after the socket was first created still gets picked up.
      auth: (cb) => cb({ token: getIdToken() }),
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
        // clientType: 'pwa' lets the backend's Cluster Fucker relay
        // (socket.js's 'cluster:action' handler) know this connection is a
        // browser, not an Electron app it could dispatch keystrokes/app
        // functions through — see CLAUDE.md's Phase 11 notes.
        s.emit('presence:join', { handle: identity.handle, color: identity.color, clientType: 'pwa' })
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
