const { chat } = require('./db')

// ── Socket.io handlers: presence, chat relay, WebRTC signaling ───────────────
module.exports = function attachSocket(io) {
  const presence = new Map() // socket.id -> { handle, color }

  io.on('connection', (socket) => {
    socket.on('presence:join', ({ handle, color }) => {
      presence.set(socket.id, { handle, color })
      socket.emit('chat:history', chat.history(100))
      socket.emit('presence:list', [...presence.entries()].map(([id, u]) => ({ id, ...u })))
      socket.broadcast.emit('presence:join', { id: socket.id, handle, color })
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
      if (user) socket.broadcast.emit('presence:leave', { id: socket.id, ...user })
    })
  })
}
