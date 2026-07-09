const express = require('express')
const { v4: uuidv4 } = require('uuid')
const qrcode = require('qrcode-generator')
const { cluster } = require('../db')
const { requireAuth } = require('../middleware/auth')

const PUBLIC_LIMIT = 5

// Takes `io` so publishing a preset can broadcast to connected clients,
// same pattern as routes/invites.js and routes/mods.js.
module.exports = function createClusterRouter(io) {
  const router = express.Router()
  router.use(requireAuth)

  // Public presets, plus the querying author's own (including private ones)
  // merged in and de-duplicated by id — a preset that's both public and
  // owned by `author` only appears once.
  router.get('/presets', (req, res) => {
    try {
      const publicList = cluster.listPublic()
      let combined = publicList
      if (req.query.author) {
        const mine = cluster.list(req.query.author)
        const publicIds = new Set(publicList.map(p => p.id))
        combined = [...publicList, ...mine.filter(p => !publicIds.has(p.id))]
      }
      res.json({ ok: true, data: combined })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.get('/presets/:id', (req, res) => {
    try {
      const preset = cluster.get(req.params.id)
      if (!preset) return res.status(404).json({ ok: false, error: 'Preset not found' })
      let layout
      try { layout = JSON.parse(preset.layout_json) } catch (e) { return res.status(500).json({ ok: false, error: 'Preset data is corrupt' }) }
      cluster.incrementLaunch(req.params.id)
      const { layout_json, ...rest } = preset
      res.json({ ok: true, data: { ...rest, layout } })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.post('/presets', (req, res) => {
    try {
      const { name, description, author, layout, isPublic } = req.body
      if (!name || !author || !layout) return res.status(400).json({ ok: false, error: 'name, author, and layout are required' })
      if (isPublic && cluster.countPublic(author) >= PUBLIC_LIMIT) {
        return res.status(400).json({ ok: false, error: `Public preset limit reached (${PUBLIC_LIMIT}/${PUBLIC_LIMIT})` })
      }
      const id = `cluster_${uuidv4()}`
      const now = new Date().toISOString()
      cluster.create({
        id, name, description: description || '', author,
        layout_json: JSON.stringify(layout), is_public: isPublic ? 1 : 0,
        created_at: now, updated_at: now,
      })
      if (isPublic) io.emit('cluster:published', { presetId: id, name, author })
      res.json({ ok: true, data: { id } })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.patch('/presets/:id', (req, res) => {
    try {
      const existing = cluster.get(req.params.id)
      if (!existing) return res.status(404).json({ ok: false, error: 'Preset not found' })
      if (req.body.author !== existing.author) return res.status(403).json({ ok: false, error: 'Not your preset' })

      const goingPublic = req.body.isPublic === true && !existing.is_public
      if (goingPublic && cluster.countPublic(existing.author) >= PUBLIC_LIMIT) {
        return res.status(400).json({ ok: false, error: `Public preset limit reached (${PUBLIC_LIMIT}/${PUBLIC_LIMIT})` })
      }

      const patch = {
        name: req.body.name ?? existing.name,
        description: req.body.description ?? existing.description,
        layout_json: req.body.layout ? JSON.stringify(req.body.layout) : existing.layout_json,
        is_public: req.body.isPublic !== undefined ? (req.body.isPublic ? 1 : 0) : existing.is_public,
        updated_at: new Date().toISOString(),
      }
      cluster.update(req.params.id, patch)
      if (goingPublic) io.emit('cluster:published', { presetId: req.params.id, name: patch.name, author: existing.author })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.delete('/presets/:id', (req, res) => {
    try {
      const existing = cluster.get(req.params.id)
      if (!existing) return res.status(404).json({ ok: false, error: 'Preset not found' })
      const author = req.body?.author || req.query.author
      if (author !== existing.author) return res.status(403).json({ ok: false, error: 'Not your preset' })
      cluster.delete(req.params.id)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // Encodes the preset's full layout JSON directly into the QR (not a deep
  // link) — this is the backend-hosted counterpart to the editor's own
  // client-side "Share QR Code" button (which QRs the in-memory layout
  // object for ANY preset, published or not, with a 50KB warn threshold —
  // see ClusterView.jsx). This route only ever serves presets that already
  // have a backend row, so it's reachable from Public Library / My Clusters
  // cards for anything already published, without the requesting client
  // needing the full layout loaded first.
  router.get('/presets/:id/qr', (req, res) => {
    try {
      const preset = cluster.get(req.params.id)
      if (!preset) return res.status(404).json({ ok: false, error: 'Preset not found' })
      if (Buffer.byteLength(preset.layout_json) > 2048) {
        return res.json({ ok: false, error: 'too_large' })
      }
      const qr = qrcode(0, 'M')
      qr.addData(preset.layout_json)
      qr.make()
      res.json({ ok: true, data: { svg: qr.createSvgTag(4) } })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  return router
}
