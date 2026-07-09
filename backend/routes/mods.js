const express = require('express')
const multer  = require('multer')
const fs      = require('fs')
const path    = require('path')
const { google } = require('googleapis')
const drive  = require('../lib/drive')
const oauth  = require('../lib/oauth')
const { modInstalls } = require('../db')

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') })

const CATEGORY_FOLDER_ENV = {
  cars: 'GOOGLE_DRIVE_CARS_FOLDER_ID',
  tracks: 'GOOGLE_DRIVE_TRACKS_FOLDER_ID',
  tools: 'GOOGLE_DRIVE_TOOLS_FOLDER_ID',
}

// 5-minute in-memory cache — the mod library changes rarely enough that a
// bare Date.now() check is simpler than wiring up a real cache dependency.
let cache = { data: null, fetchedAt: 0 }
const CACHE_TTL_MS = 5 * 60 * 1000

// Takes `io` so a completed upload can be broadcast to connected clients.
module.exports = function createModsRouter(io) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      if (cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return res.json({ ok: true, data: cache.data })
      }
      // `uploads` isn't in the original spec's response shape, but the "My Uploads"
      // nav category and the detail panel's "Uploaded by" line both need the
      // Uploads/ folder's contents to show anything before William curates them
      // into Cars/Tracks/Tools — so it's listed here too, alongside the three
      // curated folders.
      const [cars, tracks, tools, uploads] = await Promise.all([
        drive.listFolder(process.env.GOOGLE_DRIVE_CARS_FOLDER_ID),
        drive.listFolder(process.env.GOOGLE_DRIVE_TRACKS_FOLDER_ID),
        drive.listFolder(process.env.GOOGLE_DRIVE_TOOLS_FOLDER_ID),
        drive.listFolder(process.env.GOOGLE_DRIVE_UPLOADS_FOLDER_ID),
      ])
      cache = { data: { cars, tracks, tools, uploads }, fetchedAt: Date.now() }
      res.json({ ok: true, data: cache.data })
    } catch (e) {
      res.status(502).json({ ok: false, error: `Could not reach Google Drive: ${e.message}` })
    }
  })

  router.get('/download/:fileId', async (req, res) => {
    try {
      const meta = await drive.getFileMetadata(req.params.fileId)
      const fileStream = await drive.downloadFile(req.params.fileId)
      res.setHeader('Content-Disposition', `attachment; filename="${meta.name}"`)
      fileStream.pipe(res)
    } catch (e) {
      res.status(502).json({ ok: false, error: `Could not reach Google Drive: ${e.message}` })
    }
  })

  router.get('/auth/url', (req, res) => {
    try {
      res.json({ ok: true, data: { url: oauth.getAuthUrl() } })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.post('/auth/callback', async (req, res) => {
    try {
      const { code } = req.body
      if (!code) return res.status(400).json({ ok: false, error: 'code required' })
      const { tokens, userInfo } = await oauth.exchangeCode(code)
      res.json({
        ok: true,
        data: { tokens, user: { name: userInfo.name, email: userInfo.email, picture: userInfo.picture } },
      })
    } catch (e) {
      res.status(502).json({ ok: false, error: `Google sign-in failed: ${e.message}` })
    }
  })

  router.post('/upload', upload.single('mod'), async (req, res) => {
    const tempPath = req.file?.path
    try {
      const authHeader = req.headers.authorization || ''
      const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
      if (!accessToken) return res.status(401).json({ ok: false, error: 'Missing bearer token' })
      if (!req.file) return res.status(400).json({ ok: false, error: 'mod file required' })

      const { name, category, description } = req.body
      if (!name || !category) return res.status(400).json({ ok: false, error: 'name and category are required' })
      if (!['cars', 'tracks', 'tools'].includes(category)) {
        return res.status(400).json({ ok: false, error: 'category must be one of: cars, tracks, tools' })
      }

      const oauth2Client = oauth.getAuthenticatedClient({ access_token: accessToken })
      const { data: userInfo } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get()
      // "Category: {category}" is parsed back out client-side for uploads shown
      // under "My Uploads" — those haven't been curated into Cars/Tracks/Tools
      // yet, so the category the uploader picked has nowhere else to live.
      const fullDescription = `Uploaded by: ${userInfo.name}\nCategory: ${category}\n${description || ''}`.trim()

      const created = await drive.uploadFile(oauth2Client, {
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        stream: fs.createReadStream(tempPath),
        folderId: process.env.GOOGLE_DRIVE_UPLOADS_FOLDER_ID,
        description: fullDescription,
      })

      io.emit('mod:uploaded', { name, category, uploadedBy: userInfo.name, fileId: created.id })
      res.json({ ok: true, data: { fileId: created.id, name: created.name } })
    } catch (e) {
      res.status(502).json({ ok: false, error: `Upload failed: ${e.message}` })
    } finally {
      if (tempPath) fs.unlink(tempPath, () => {})
    }
  })

  router.get('/installs/:handle', (req, res) => {
    try {
      const rows = modInstalls.list(req.params.handle)
      res.json({ ok: true, data: rows.map(r => ({ fileId: r.file_id, installedAt: r.installed_at, versionDate: r.version_date })) })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  router.post('/installs', (req, res) => {
    try {
      const { handle, fileId, versionDate } = req.body
      if (!handle || !fileId) return res.status(400).json({ ok: false, error: 'handle and fileId are required' })
      modInstalls.upsert({ fileId, handle, installedAt: new Date().toISOString(), versionDate })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  return router
}
