const express = require('express')
const multer  = require('multer')
const path    = require('path')
const crypto  = require('crypto')
const { events } = require('../db')

const router = express.Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

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
    const id = `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
    const event = {
      id,
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

router.patch('/:id', (req, res) => {
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

module.exports = router
