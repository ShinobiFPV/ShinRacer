require('dotenv').config()

const express = require('express')
const http    = require('http')
const path    = require('path')
const fs      = require('fs')
const cors    = require('cors')
const { Server } = require('socket.io')

const createEventsRouter  = require('./routes/events')
const statsRouter         = require('./routes/stats')
const chatRouter          = require('./routes/chat')
const createInvitesRouter = require('./routes/invites')
const createModsRouter    = require('./routes/mods')
const pushRouter          = require('./routes/push')
const authRouter          = require('./routes/auth')
const attachSocket        = require('./socket')
const { invites, events } = require('./db')
const push                = require('./lib/push')

const PORT = process.env.PORT || 3000
const UPLOADS_DIR = path.join(__dirname, 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const app = express()
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }))
app.use(express.json())
app.use('/uploads', express.static(UPLOADS_DIR))

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })
attachSocket(io)

app.use('/api/events', createEventsRouter(io))
app.use('/api/stats', statsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/invites', createInvitesRouter(io))
app.use('/api/mods', createModsRouter(io))
app.use('/api/push', pushRouter)
app.use('/api/auth', authRouter)

invites.cleanup()

// Flat shape (no `data` wrapper) — used by SettingsView's "Test connection" button.
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }))

// 24h event reminders. `remindedEventIds` only lives for this process's
// uptime — a restart mid-window can re-notify once, the same tradeoff the
// Electron app's own reminder Set already accepted (see Phase 4 notes in
// CLAUDE.md), which is harmless for a one-line "starts soon" heads-up.
const remindedEventIds = new Set()
setInterval(async () => {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const upcoming = events.list().filter(e => {
    if (e.status !== 'happening' || remindedEventIds.has(e.id)) return false
    const when = new Date(`${e.date}T${e.time}`).getTime()
    return when > now && when - now <= dayMs
  })
  for (const e of upcoming) {
    remindedEventIds.add(e.id)
    await push.sendToAll({ title: `Race night: ${e.name}`, body: `${e.track} · ${e.date} ${e.time}` })
  }
}, 60 * 60 * 1000)

server.listen(PORT, () => {
  console.log(`ShinRacer backend listening on :${PORT}`)
})
