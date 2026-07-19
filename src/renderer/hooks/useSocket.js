import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getBackendUrl, onBackendUrlChange } from '../lib/api'

// One socket connection per app session (module-level singleton) rather than
// one per component mount — so switching away from Comms and back doesn't
// tear down and reconnect, and multiple consumers would share the same link.
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
      // A function (not a plain object) so socket.io-client re-invokes it on
      // every connect *and* every reconnect attempt — the backend's io.use
      // middleware (socket.js) now rejects any handshake with no/invalid
      // token, and this guarantees a reconnect after a token refresh picks
      // up the fresh one instead of replaying whatever was current when the
      // socket was first constructed.
      auth: (cb) => {
        window.api.store.get('googleAuth').then(a => cb({ token: a?.idToken }))
      },
    })
    singletonUrl = url
  }
  return singletonSocket
}

// Connects to the backend, announces presence, and tracks who else is online.
export function useSocket(identity) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => {
    if (!identity?.handle) return

    // Wires listeners onto one socket instance; returns the matching teardown.
    const attach = (s) => {
      const announce = () => {
        setConnected(true)
        // clientType: 'electron' lets the backend's Cluster Fucker relay
        // (socket.js's 'cluster:action' handler) target this specific
        // connection when a PWA phone triggers an appFunction — see
        // CLAUDE.md's Phase 11 notes.
        s.emit('presence:join', { handle: identity.handle, color: identity.color, clientType: 'electron' })
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

    // Rebuild the shared connection if Settings changes the backend URL mid-session.
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
