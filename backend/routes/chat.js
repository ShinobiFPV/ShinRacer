const express = require('express')
const { chat } = require('../db')

const router = express.Router()

router.get('/history', (req, res) => {
  try {
    res.json({ ok: true, data: chat.history(100) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

module.exports = router
