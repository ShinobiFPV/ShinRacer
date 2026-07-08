const express = require('express')
const crypto  = require('crypto')
const { stats } = require('../db')

const router = express.Router()

router.post('/lap', (req, res) => {
  try {
    const b = req.body
    const id = `lap_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
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
    res.json({ ok: true, data: stats.listSessions() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/bests', (req, res) => {
  try {
    res.json({ ok: true, data: stats.personalBests(req.query.handle) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/leaderboard', (req, res) => {
  try {
    res.json({ ok: true, data: stats.leaderboardByTrack() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

module.exports = router
