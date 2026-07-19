const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { pushSubs } = require('../db')
const { sendToHandle } = require('../lib/push')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

// Not in the original spec's route list, but pushManager.subscribe() on the
// client needs the VAPID *public* key as its applicationServerKey — there's
// no other way for the PWA to get it, and the public half is safe to serve
// (it's the private key that must never leave the backend).
router.get('/vapid-public-key', (req, res) => {
  res.json({ ok: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY || null } })
})

router.post('/subscribe', (req, res) => {
  try {
    const { handle, subscription } = req.body
    if (!handle || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ ok: false, error: 'handle and a full subscription (endpoint + keys.p256dh + keys.auth) are required' })
    }
    pushSubs.save({
      id: `push_${uuidv4()}`,
      handle,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      created_at: new Date().toISOString(),
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.delete('/subscribe', (req, res) => {
  try {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ ok: false, error: 'endpoint required' })
    pushSubs.delete(endpoint)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Debug-only: lets Settings' "Test notification" button prove the whole
// subscribe -> deliver round-trip works without waiting for a real event.
router.post('/test', async (req, res) => {
  try {
    const { handle } = req.body
    if (!handle) return res.status(400).json({ ok: false, error: 'handle required' })
    await sendToHandle(handle, { title: 'ShinRacer', body: 'Test notification — push is working.' })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

module.exports = router
