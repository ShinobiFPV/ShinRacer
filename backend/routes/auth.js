const express = require('express')
const { verifyGoogleToken, requireAuth, requireRole, getRole } = require('../middleware/auth')
const { getRoles, saveRoles } = require('../lib/roles')
const { refreshIdToken } = require('../lib/oauth')
const { users } = require('../db')

const router = express.Router()

// The PWA builds its own Google OAuth URL client-side (PKCE flow — see
// pwa/src/lib/auth.js), so it needs the client id and redirect URI but must
// never see the client secret. This is the one config value the Electron app
// never needed, since accomp://oauth is a fixed scheme, not a per-deployment URL.
//
// GOOGLE_OAUTH_CLIENT_ID_PWA, not GOOGLE_OAUTH_CLIENT_ID — the PWA needs its
// own "Web application" type OAuth client (editable redirect URI list); the
// original client is "Desktop app" type and can't register an arbitrary
// HTTPS redirect at all. See lib/oauth.js's createOAuthClient and
// docs/GOOGLE_OAUTH_SETUP.md's PWA section for the full reasoning.
router.get('/config', (req, res) => {
  res.json({
    ok: true,
    data: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID_PWA || null,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI_PWA || null,
    },
  })
})

function shapeUser(user) {
  return {
    uid: user.uid, email: user.email, name: user.name, picture: user.picture, role: user.role,
    isAdmin: user.role === 'admin',
    isHost: user.role === 'host' || user.role === 'admin',
    isCrew: true, // always true for any authenticated user
  }
}

// Primary sign-in endpoint — the client already has a Google ID token (from
// the existing accomp://oauth / PWA PKCE exchange, see lib/oauth.js), this
// just verifies it and resolves a role. Called on every app start to check
// the stored token is still valid, and every time the role might have
// changed (William just edited roles.json).
//
// Also accepts `refreshToken` instead of `idToken` — the client's stored
// idToken has expired and it wants a fresh one. This has to happen here
// (server-side) rather than the client hitting Google's token endpoint
// directly with the refresh_token, because that grant requires this app's
// OAuth client secret, which has never left the backend. See lib/oauth.js's
// refreshIdToken for the full reasoning.
router.post('/google', async (req, res) => {
  try {
    let idToken = req.body.idToken
    let freshTokens = null
    if (!idToken && req.body.refreshToken) {
      freshTokens = await refreshIdToken(req.body.refreshToken)
      idToken = freshTokens.id_token
    }
    if (!idToken) return res.status(400).json({ ok: false, error: 'idToken or refreshToken required' })
    const user = await verifyGoogleToken(idToken)
    user.role = getRole(user.uid)
    users.upsert(user)
    const data = shapeUser(user)
    // Only present when this call came in via the refresh path — the client
    // needs the new idToken/expiryDate to update its stored copy.
    if (freshTokens) {
      data.idToken = freshTokens.id_token
      data.expiryDate = freshTokens.expiry_date
    }
    res.json({ ok: true, data })
  } catch (e) {
    res.status(401).json({ ok: false, error: e.message })
  }
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, data: shapeUser(req.user) })
})

router.get('/roles-config', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ ok: true, data: getRoles() })
})

router.patch('/roles-config', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { admins, hosts } = req.body
    if (!Array.isArray(admins) || !Array.isArray(hosts)) {
      return res.status(400).json({ ok: false, error: 'admins and hosts must both be arrays' })
    }
    saveRoles({ admins, hosts })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

module.exports = router
