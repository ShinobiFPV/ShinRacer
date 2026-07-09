// Google ID token verification via Google's tokeninfo endpoint — no service
// account or JWT library needed for this, just a plain HTTPS call. This is
// deliberately separate from lib/oauth.js (the Drive-scoped authorization
// code flow used for Mod Manager uploads and, since Phase 12, the app's own
// sign-in) — this file only ever *verifies* a token that flow already
// produced, on every authenticated request and every socket connection.
const { getRoles } = require('../lib/roles')

async function verifyGoogleToken(idToken) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  if (!res.ok) throw new Error('Invalid token')
  const payload = await res.json()
  if (payload.aud !== process.env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error('Token audience mismatch')
  }
  return {
    uid: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    emailVerified: payload.email_verified === 'true',
  }
}

function getRole(uid) {
  const r = getRoles()
  if (r.admins.includes(uid)) return 'admin'
  if (r.hosts.includes(uid)) return 'host'
  return 'crew'
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ ok: false, error: 'No token' })
  try {
    req.user = await verifyGoogleToken(token)
    req.user.role = getRole(req.user.uid)
    next()
  } catch (e) {
    res.status(401).json({ ok: false, error: 'Invalid token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ ok: false, error: 'Insufficient role' })
    }
    next()
  }
}

module.exports = { requireAuth, requireRole, getRole, verifyGoogleToken }
