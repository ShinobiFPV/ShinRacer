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
const attachSocket        = require('./socket')
const { invites }         = require('./db')

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

invites.cleanup()

// Flat shape (no `data` wrapper) — used by SettingsView's "Test connection" button.
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }))

server.listen(PORT, () => {
  console.log(`AC Companion backend listening on :${PORT}`)
})
