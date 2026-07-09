const { chat, hosts } = require('./db')
const { verifyGoogleToken, getRole } = require('./middleware/auth')

// ── Socket.io handlers: presence, chat relay, WebRTC signaling ───────────────
// WebRTC 'to'/'from' addresses are socket ids (already unique per connection and
// automatically routable via io.to(id) — Socket.IO joins every socket to a room
// named after its own id). A handle->socketId map was considered instead, but a
// single handle can have more than one live connection (e.g. two tabs), which a
// handle-keyed map can't disambiguate — socket id has no such collision.
module.exports = function attachSocket(io) {
  // Every socket must present a valid Google ID token before any event
  // handler below ever runs — same verification middleware.js's requireAuth
  // uses for REST, just wired as Socket.io connection middleware instead of
  // Express middleware. socket.user is then available to every handler.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('No token'))
    try {
      const user = await verifyGoogleToken(token)
      user.role = getRole(user.uid)
      socket.user = user
      next()
    } catch (e) {
      next(new Error('Invalid token'))
    }
  })

  const presence = new Map() // socket.id -> { uid, name, picture, role, handle, color, clientType }

  const presenceList = () => [...presence.entries()].map(([id, u]) => ({ id, ...u }))

  io.on('connection', (socket) => {
    // `clientType` ('electron' | 'pwa') is optional and only used by the
    // Cluster Fucker's cluster:action relay below — everything else about
    // presence is unchanged from Phase 1, just with the Google profile
    // (uid/name/picture/role) added from the verified token rather than
    // trusted from the client the way handle/color still are (those stay
    // legitimate client-chosen display preferences, not identity).
    socket.on('presence:join', ({ handle, color, clientType }) => {
      const entry = { uid: socket.user.uid, name: socket.user.name, picture: socket.user.picture, role: socket.user.role, handle, color, clientType }
      presence.set(socket.id, entry)
      socket.emit('chat:history', chat.history(100))
      socket.broadcast.emit('presence:join', { id: socket.id, ...entry })
      io.emit('presence:list', presenceList())
      // Host/Admin Electron clients double as host machines — see
      // backend/routes/hosts.js. is_online only ever reflects a live socket
      // connection, so a crashed app (no clean disconnect) still eventually
      // reads correctly on the *next* connect, and reads offline to anyone
      // checking in the meantime, which is the safe direction to be wrong in.
      if (clientType === 'electron' && (socket.user.role === 'host' || socket.user.role === 'admin')) {
        hosts.setOnline(socket.user.uid, true)
      }
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
        if (user.clientType === 'electron' && (user.role === 'host' || user.role === 'admin')) {
          hosts.setOnline(user.uid, false)
        }
      }
    })
  })
}
