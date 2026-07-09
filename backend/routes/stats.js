const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { stats } = require('../db')

const router = express.Router()

// Body/query field names are camelCase (sessionId, lapTime, sector1..3) to match
// the renderer's existing StatsView/useTelemetry contract — DB columns stay snake_case.
router.post('/lap', (req, res) => {
  try {
    const b = req.body
    const missing = ['sessionId', 'handle', 'track', 'lapTime'].filter(k => b[k] === undefined || b[k] === null || b[k] === '')
    if (missing.length) return res.status(400).json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` })

    const id = `lap_${uuidv4()}`
    const ts = b.ts || new Date().toISOString()
    stats.upsertSession({ id: b.sessionId, track: b.track, date: ts.slice(0, 10), server_name: b.serverName, handle: b.handle })
    const lap = stats.addLap({
      id, session_id: b.sessionId, handle: b.handle, track: b.track, car: b.car,
      lap_time_ms: b.lapTime, s1_ms: b.sector1 ?? null, s2_ms: b.sector2 ?? null, s3_ms: b.sector3 ?? null,
      lap_number: b.lapNumber ?? null, ts, valid: b.valid === false ? 0 : 1,
    })
    res.json({ ok: true, data: lap })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Explicit session creation, called by the renderer on the first lap of a capture —
// upsertSession() already auto-creates a session from POST /lap too, so this is
// mainly what gives sessions.created_at a value (used for the "{track} — HH:MM" label).
router.post('/session', (req, res) => {
  try {
    const b = req.body
    const missing = ['id', 'track', 'date'].filter(k => !b[k])
    if (missing.length) return res.status(400).json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` })

    const participants = b.participants?.length ? b.participants : [null]
    participants.forEach(handle => {
      stats.upsertSession({ id: b.id, track: b.track, date: b.date, server_name: b.server_name, handle })
    })
    res.json({ ok: true, data: stats.listSessions().find(s => s.id === b.id) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/laps', (req, res) => {
  try {
    const { handle, track, sessionId } = req.query
    res.json({ ok: true, data: stats.listLaps({ handle, track, sessionId }) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/sessions', (req, res) => {
  try {
    res.json({ ok: true, data: stats.listSessions(req.query.track) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/bests', (req, res) => {
  try {
    res.json({ ok: true, data: stats.personalBests(req.query.handle, req.query.track) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Per-handle-per-track bests (car-agnostic) for the multi-driver friends comparison —
// kept separate from /bests (which keeps car granularity for the single-driver table)
// rather than overloading one endpoint with two response shapes.
router.get('/leaderboard', (req, res) => {
  try {
    res.json({ ok: true, data: stats.leaderboardByTrack() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

module.exports = router
