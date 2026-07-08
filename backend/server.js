const express = require('express')
const http    = require('http')
const path    = require('path')
const cors    = require('cors')
const { Server } = require('socket.io')

const eventsRouter = require('./routes/events')
const statsRouter  = require('./routes/stats')
const chatRouter   = require('./routes/chat')
const attachSocket = require('./socket')

const PORT = process.env.PORT || 3000

const app = express()
app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api/events', eventsRouter)
app.use('/api/stats', statsRouter)
app.use('/api/chat', chatRouter)

app.get('/api/health', (req, res) => res.json({ ok: true, data: { status: 'up', ts: Date.now() } }))

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })
attachSocket(io)

server.listen(PORT, () => {
  console.log(`AC Companion backend listening on :${PORT}`)
})
