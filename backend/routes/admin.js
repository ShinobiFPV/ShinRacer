const express = require('express')
const { exec } = require('child_process')
const { users, hosts } = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { getRoles, saveRoles } = require('../lib/roles')

const router = express.Router()
router.use(requireAuth, requireRole('admin'))

router.get('/users', (req, res) => {
  try {
    res.json({ ok: true, data: users.list() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Updates both roles.json (the actual permission source of truth) and the
// users table's cached `role` column (display-only — every real permission
// check re-derives role from roles.json via getRole(), never from this
// table) in one call, so an admin using the Crew Management table doesn't
// have to separately remember to also edit roles.json.
router.patch('/users/:uid/role', (req, res) => {
  try {
    const { role } = req.body
    if (!['admin', 'host', 'crew'].includes(role)) {
      return res.status(400).json({ ok: false, error: "role must be 'admin', 'host', or 'crew'" })
    }
    const current = getRoles()
    const uid = req.params.uid
    const admins = current.admins.filter(u => u !== uid)
    const hosts = current.hosts.filter(u => u !== uid)
    if (role === 'admin') admins.push(uid)
    else if (role === 'host') hosts.push(uid)
    saveRoles({ admins, hosts })
    users.setRole(uid, role)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/hosts', (req, res) => {
  try {
    res.json({ ok: true, data: hosts.list() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.delete('/hosts/:uid', (req, res) => {
  try {
    hosts.remove(req.params.uid)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/system/health', (req, res) => {
  res.json({ ok: true, data: {
    uptime: process.uptime(),
    memoryRss: process.memoryUsage().rss,
    nodeVersion: process.version,
    platform: process.platform,
  } })
})

// Restarts the systemd service this very process runs as (passwordless sudo
// already configured on your-pi for exactly this command — see
// scripts/deploy-backend.ps1). The response is sent before the restart fires
// since the process restarting itself can't reply afterward.
router.post('/system/restart', (req, res) => {
  res.json({ ok: true, data: { message: 'Restart triggered' } })
  setTimeout(() => {
    exec('sudo systemctl restart ac-companion', (err) => {
      if (err) console.error('Restart command failed:', err.message)
    })
  }, 250)
})

module.exports = router
