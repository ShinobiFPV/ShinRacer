const express = require('express')
const { invites } = require('../db')

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
function generateCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return code
}

// Takes `io` so a new invite can be broadcast to connected clients — matches events.js's pattern.
module.exports = function createInvitesRouter(io) {
  const router = express.Router()

  router.post('/', (req, res) => {
    try {
      const { serverName, host, port, password, track, cars, expiresIn, created_by } = req.body
      if (!host || !port) return res.status(400).json({ ok: false, error: 'host and port are required' })

      let code = generateCode()
      while (invites.get(code)) code = generateCode() // 6-char code space is large but collisions are cheap to re-roll

      const now = Date.now()
      const expiresMs = (Number(expiresIn) || 3600) * 1000
      const invite = {
        code,
        server_name: serverName || '',
        host,
        port,
        password: password || '',
        track: track || '',
        cars: JSON.stringify(cars || []),
        created_by: created_by || '',
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + expiresMs).toISOString(),
      }
      const created = invites.create(invite)
      io.emit('invite:created', { code, serverName: created.server_name, createdBy: created.created_by })
      res.json({ ok: true, data: { code, url: `accomp://${code}`, expiresAt: created.expires_at } })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.get('/:code', (req, res) => {
    try {
      const invite = invites.get(req.params.code.toUpperCase())
      if (!invite) return res.status(404).json({ ok: false, error: 'Invite not found or expired' })
      const expiresIn = Math.max(0, Math.round((new Date(invite.expires_at).getTime() - Date.now()) / 1000))
      res.json({
        ok: true,
        data: {
          serverName: invite.server_name, host: invite.host, port: invite.port,
          password: invite.password, track: invite.track, cars: invite.cars, expiresIn,
        },
      })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.delete('/:code', (req, res) => {
    try {
      invites.delete(req.params.code.toUpperCase())
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  return router
}
