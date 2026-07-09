const { chat } = require('./db')

// ── Socket.io handlers: presence, chat relay, WebRTC signaling ───────────────
// WebRTC 'to'/'from' addresses are socket ids (already unique per connection and
// automatically routable via io.to(id) — Socket.IO joins every socket to a room
// named after its own id). A handle->socketId map was considered instead, but a
// single handle can have more than one live connection (e.g. two tabs), which a
// handle-keyed map can't disambiguate — socket id has no such collision.
module.exports = function attachSocket(io) {
  const presence = new Map() // socket.id -> { handle, color, clientType }

  const presenceList = () => [...presence.entries()].map(([id, u]) => ({ id, ...u }))

  io.on('connection', (socket) => {
    // `clientType` ('electron' | 'pwa') is optional and only used by the
    // Cluster Fucker's cluster:action relay below — everything else about
    // presence is unchanged from Phase 1.
    socket.on('presence:join', ({ handle, color, clientType }) => {
      presence.set(socket.id, { handle, color, clientType })
      socket.emit('chat:history', chat.history(100))
      socket.broadcast.emit('presence:join', { id: socket.id, handle, color })
      io.emit('presence:list', presenceList())
    })

    socket.on('chat:message', ({ handle, color, text }) => {
      const msg = { id: `msg_${Date.now()}_${socket.id.slice(0, 4)}`, handle, color, text, ts: new Date().toISOString() }
      chat.addMessage(msg)
      io.emit('chat:message', msg)
    })

    socket.on('rtc:offer',  ({ to, payload }) => io.to(to).emit('rtc:offer',  { from: socket.id, payload }))
    socket.on('rtc:answer', ({ to, payload }) => io.to(to).emit('rtc:answer', { from: socket.id, payload }))
    socket.on('rtc:ice',    ({ to, payload }) => io.to(to).emit('rtc:ice',    { from: socket.id, payload }))

    // The Cluster Fucker: an appFunction-type action bound in a PWA preset
    // can't dispatch a keystroke (no Electron IPC in a browser), so it's
    // relayed here instead. "The host" isn't a well-defined single machine
    // in a multi-person crew — every crew member may run their own Electron
    // app on their own rig — so this targets the *same handle's* own
    // connected Electron session, i.e. your phone remote-controls your own
    // desktop app, never someone else's PC.
    socket.on('cluster:action', ({ fn, param, from }) => {
      for (const [id, user] of presence) {
        if (user.handle === from && user.clientType === 'electron') {
          io.to(id).emit('cluster:action', { fn, param, from })
        }
      }
    })

    socket.on('disconnect', () => {
      const user = presence.get(socket.id)
      presence.delete(socket.id)
      if (user) {
        socket.broadcast.emit('presence:leave', { id: socket.id, ...user })
        io.emit('presence:list', presenceList())
      }
    })
  })
}
