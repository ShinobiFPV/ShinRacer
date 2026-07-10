const express = require('express')
const { requireAuth } = require('../middleware/auth')

// Car Stereo (Phase 18) — proxies Spotify's OAuth token exchange and Web API
// calls so SPOTIFY_CLIENT_SECRET never leaves the backend, same principle as
// lib/oauth.js's Google flow. The Web Playback SDK itself and its own
// streaming/player calls happen entirely in the renderer against Spotify's
// own domains (see index.html's CSP) — this router only ever handles the
// token lifecycle and read-only Web API proxying (search/playlists/recently
// played), never audio itself.
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

// Settings' "Save & Connect" (SettingsView.jsx) lets whoever's hosting the
// backend punch in a Spotify app's credentials without SSHing in to edit
// backend/.env — this in-memory override wins over the env vars for the
// life of the process. It does NOT persist across a backend restart (same
// disclosed tradeoff as the in-memory reminder Sets elsewhere in this
// backend) — for that, the same values still belong in backend/.env on
// shinobi, per docs/CAR_STEREO_SETUP.md.
let runtimeCreds = { clientId: null, clientSecret: null }

function getCreds() {
  return {
    clientId: runtimeCreds.clientId || process.env.SPOTIFY_CLIENT_ID || null,
    clientSecret: runtimeCreds.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || null,
  }
}

function spotifyConfigured() {
  const { clientId, clientSecret } = getCreds()
  return !!(clientId && clientSecret)
}

function basicAuthHeader() {
  const { clientId, clientSecret } = getCreds()
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

const router = express.Router()

router.post('/spotify/configure', requireAuth, (req, res) => {
  const { clientId, clientSecret } = req.body
  if (!clientId || !clientSecret) return res.status(400).json({ ok: false, error: 'clientId and clientSecret are required' })
  runtimeCreds = { clientId, clientSecret }
  res.json({ ok: true })
})

router.get('/spotify/client-id', (req, res) => {
  const { clientId } = getCreds()
  if (!clientId) return res.status(400).json({ ok: false, error: 'Spotify is not configured on the backend yet' })
  res.json({ ok: true, data: { clientId } })
})

router.post('/spotify/token', async (req, res) => {
  if (!spotifyConfigured()) return res.status(400).json({ ok: false, error: 'Spotify is not configured on the backend (SPOTIFY_CLIENT_ID/SECRET missing)' })
  const { code, codeVerifier, redirectUri } = req.body
  if (!code) return res.status(400).json({ ok: false, error: 'code required' })
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:9722',
    })
    if (codeVerifier) body.set('code_verifier', codeVerifier)
    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await tokenRes.json()
    if (!tokenRes.ok) return res.status(502).json({ ok: false, error: data.error_description || data.error || 'Spotify token exchange failed' })
    res.json({
      ok: true,
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiryDate: Date.now() + data.expires_in * 1000,
      },
    })
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message })
  }
})

router.post('/spotify/refresh', async (req, res) => {
  if (!spotifyConfigured()) return res.status(400).json({ ok: false, error: 'Spotify is not configured on the backend (SPOTIFY_CLIENT_ID/SECRET missing)' })
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ ok: false, error: 'refreshToken required' })
  try {
    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    const data = await tokenRes.json()
    if (!tokenRes.ok) return res.status(502).json({ ok: false, error: data.error_description || data.error || 'Spotify token refresh failed' })
    res.json({
      ok: true,
      // Spotify only returns a new refresh_token sometimes — keep the caller's if absent.
      data: { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken, expiryDate: Date.now() + data.expires_in * 1000 },
    })
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message })
  }
})

async function spotifyGet(req, res, path) {
  const token = req.headers['x-spotify-token']
  if (!token) return res.status(401).json({ ok: false, error: 'Missing X-Spotify-Token header' })
  try {
    const url = new URL(`${SPOTIFY_API_BASE}${path}`)
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v)
    const apiRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await apiRes.json()
    if (!apiRes.ok) return res.status(apiRes.status === 401 ? 401 : 502).json({ ok: false, error: data.error?.message || 'Spotify API request failed' })
    res.json({ ok: true, data })
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message })
  }
}

router.get('/spotify/search', requireAuth, (req, res) => {
  const q = req.query.q
  if (!q) return res.status(400).json({ ok: false, error: 'q required' })
  spotifyGet(req, res, `/search?q=${encodeURIComponent(q)}&type=${req.query.type || 'track'}&limit=${req.query.limit || 20}`)
})

router.get('/spotify/playlists', requireAuth, (req, res) => spotifyGet(req, res, '/me/playlists?limit=50'))

router.get('/spotify/recently-played', requireAuth, (req, res) => spotifyGet(req, res, '/me/player/recently-played?limit=20'))

module.exports = router
