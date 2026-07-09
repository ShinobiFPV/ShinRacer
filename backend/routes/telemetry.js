const express = require('express')
const { requireAuth } = require('../middleware/auth')

// In-memory only, by design — this is a ~500ms-latency mirror of whatever
// the host's Electron app is currently seeing via AC's Shared Memory API
// (see src/renderer/hooks/useTelemetryShm.js), not a historical record.
// Lap Stats already owns durable telemetry storage (the UDP-fed laps
// table); this is purely "what does the dash look like right now" for the
// PWA's Cluster runtime and gauge widgets, so there's nothing here worth a
// SQLite table — it should vanish on restart just like the live session did.
let latestTelemetryFrame = null

// Takes `io` so a posted frame can also go out over Socket.io in real time —
// the PWA's ClusterPage prefers polling GET /latest every 500ms (battery),
// but nothing stops another consumer from listening for the socket event instead.
module.exports = function createTelemetryRouter(io) {
  const router = express.Router()
  router.use(requireAuth)

  router.post('/frame', (req, res) => {
    const { frame } = req.body
    if (!frame) return res.status(400).json({ ok: false, error: 'frame required' })
    latestTelemetryFrame = frame
    io.emit('telemetry:frame', frame)
    res.json({ ok: true })
  })

  router.get('/latest', (req, res) => {
    res.json({ ok: true, data: latestTelemetryFrame })
  })

  return router
}
