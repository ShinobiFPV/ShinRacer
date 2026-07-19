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

// Forza World Map (Phase 17) — same in-memory-only, no-persistence
// reasoning as latestTelemetryFrame above: this is "where is everyone right
// now," not a historical record. Keyed by handle (one entry per crew
// member, not per connection) since a handle re-posting just overwrites its
// own last-known position.
let forzaPositions = {}
const FORZA_POSITION_TTL_MS = 5000

function pruneForzaPositions() {
  const cutoff = Date.now() - FORZA_POSITION_TTL_MS
  for (const [handle, pos] of Object.entries(forzaPositions)) {
    if (pos.ts < cutoff) delete forzaPositions[handle]
  }
}

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

  // Forza World Map: main.js POSTs the local player's position here every
  // 500ms while FH5/FH6 telemetry is active (see main.js's startShmTelemetry
  // onFrame handler) — handle is trusted from the verified req.user, not the
  // request body, same as everywhere else auth-derived identity matters.
  router.post('/forza-position', (req, res) => {
    const { color, x, z, speed, game, isRacing, heading } = req.body
    const handle = req.user.name
    pruneForzaPositions()
    forzaPositions[handle] = { handle, color, x, z, speed, game, isRacing, heading, ts: Date.now() }
    io.emit('forza:position', forzaPositions[handle])
    res.json({ ok: true })
  })

  router.get('/forza-positions', (req, res) => {
    pruneForzaPositions()
    res.json({ ok: true, data: Object.values(forzaPositions) })
  })

  return router
}
