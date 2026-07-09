const express = require('express')
const multer  = require('multer')
const path    = require('path')
const { v4: uuidv4 } = require('uuid')
const { events } = require('../db')

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

// Takes `io` so /cancel can broadcast to connected clients.
module.exports = function createEventsRouter(io) {
  const router = express.Router()

  router.get('/', (req, res) => {
    try {
      res.json({ ok: true, data: events.list() })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.post('/', upload.single('poster'), (req, res) => {
    try {
      const b = req.body
      const missing = ['name', 'date', 'time', 'track', 'proposed_by'].filter(k => !b[k])
      if (missing.length) return res.status(400).json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` })

      const event = {
        id: `evt_${uuidv4()}`,
        name: b.name,
        type: b.type,
        date: b.date,
        time: b.time,
        track: b.track,
        car_restriction: b.car_restriction || '',
        notes: b.notes || '',
        poster_path: req.file ? `/uploads/${req.file.filename}` : null,
        proposed_by: b.proposed_by,
        status: 'proposed',
        created_at: new Date().toISOString(),
        required_mods: JSON.stringify(b.required_mods ? JSON.parse(b.required_mods) : []),
      }
      res.json({ ok: true, data: events.create(event) })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // Edits every field except id/proposed_by/created_at. Any user may edit — friends-only app, no ownership check.
  router.put('/:id', upload.single('poster'), (req, res) => {
    try {
      const b = req.body
      const missing = ['name', 'date', 'time', 'track'].filter(k => !b[k])
      if (missing.length) return res.status(400).json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` })

      const existing = events.get(req.params.id)
      if (!existing) return res.status(404).json({ ok: false, error: 'Event not found' })

      const patch = {
        name: b.name,
        type: b.type,
        date: b.date,
        time: b.time,
        track: b.track,
        car_restriction: b.car_restriction || '',
        notes: b.notes || '',
        poster_path: req.file ? `/uploads/${req.file.filename}` : existing.poster_path,
        required_mods: JSON.stringify(b.required_mods ? JSON.parse(b.required_mods) : []),
      }
      const updated = events.update(req.params.id, patch)
      res.json({ ok: true, data: updated })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.patch('/:id/accept', (req, res) => {
    try {
      const { handle } = req.body
      if (!handle) return res.status(400).json({ ok: false, error: 'handle required' })
      const updated = events.accept(req.params.id, handle)
      if (!updated) return res.status(404).json({ ok: false, error: 'Event not found' })
      res.json({ ok: true, data: updated })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.patch('/:id/cancel', (req, res) => {
    try {
      const updated = events.cancel(req.params.id)
      if (!updated) return res.status(404).json({ ok: false, error: 'Event not found' })
      io.emit('event:cancelled', { eventId: req.params.id })
      res.json({ ok: true, data: updated })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // Registered before /:id — otherwise Express would match 'all' as an :id param.
  router.delete('/all', (req, res) => {
    try {
      events.deleteAll()
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.delete('/:id', (req, res) => {
    try {
      events.deleteOne(req.params.id)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  return router
}
