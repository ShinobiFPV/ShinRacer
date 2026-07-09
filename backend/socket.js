const { chat } = require('./db')

// ── Socket.io handlers: presence, chat relay, WebRTC signaling ───────────────
// WebRTC 'to'/'from' addresses are socket ids (already unique per connection and
// automatically routable via io.to(id) — Socket.IO joins every socket to a room
// named after its own id). A handle->socketId map was considered instead, but a
// single handle can have more than one live connection (e.g. two tabs), which a
// handle-keyed map can't disambiguate — socket id has no such collision.
module.exports = function attachSocket(io) {
  const presence = new Map() // socket.id -> { handle, color }

  const presenceList = () => [...presence.entries()].map(([id, u]) => ({ id, ...u }))

  io.on('connection', (socket) => {
    socket.on('presence:join', ({ handle, color }) => {
      presence.set(socket.id, { handle, color })
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
