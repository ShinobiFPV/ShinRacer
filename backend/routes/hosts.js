const express = require('express')
const { hosts } = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.post('/register', requireRole('admin', 'host'), (req, res) => {
  try {
    const { machineName, acPath } = req.body
    if (!machineName) return res.status(400).json({ ok: false, error: 'machineName required' })
    const record = hosts.register({ uid: req.user.uid, name: req.user.name, machineName, acPath: acPath || null })
    res.json({ ok: true, data: record })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/available', (req, res) => {
  try {
    res.json({ ok: true, data: hosts.available().map(h => ({ uid: h.uid, name: h.name, machineName: h.machine_name, acPath: h.ac_path })) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/:uid/status', (req, res) => {
  try {
    const host = hosts.get(req.params.uid)
    if (!host) return res.status(404).json({ ok: false, error: 'Not registered as a host' })
    res.json({ ok: true, data: host })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

module.exports = router
