const { google } = require('googleapis')

// `redirectUri` defaults to the Electron app's fixed accomp://oauth scheme —
// the PWA passes its own (http://<host>/auth/callback), since Google requires
// the redirect_uri in the token exchange to exactly match the one used when
// the auth URL was built, and the two apps use different ones.
function createOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_OAUTH_REDIRECT_URI
  )
}

function getAuthUrl(redirectUri) {
  const oauth2Client = createOAuthClient(redirectUri)
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      // 'openid' is what makes Google actually include an id_token in the
      // token response (see exchangeCode below) — without it the response
      // is access/refresh tokens only. Phase 12's whole sign-in system is
      // built on verifying that id_token server-side via Google's tokeninfo
      // endpoint (middleware/auth.js), so this scope isn't optional anymore
      // the way it effectively was when this flow only fed the Mod Manager's
      // Drive uploads.
      'openid',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
}

// Tokens are handed back to the client and never persisted here — the backend
// is stateless with respect to any one user's Google identity. `codeVerifier`
// is only ever set by the PWA's PKCE flow (see pwa/src/lib/auth.js) — the
// Electron app's flow has no verifier and google-auth-library treats an
// undefined codeVerifier as "not PKCE", so this stays a no-op for Electron.
async function exchangeCode(code, { redirectUri, codeVerifier } = {}) {
  const oauth2Client = createOAuthClient(redirectUri)
  const { tokens } = await oauth2Client.getToken({ code, codeVerifier })
  oauth2Client.setCredentials(tokens)
  const { data: userInfo } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get()
  return { tokens, userInfo }
}

function getAuthenticatedClient(tokens) {
  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials(tokens)
  return oauth2Client
}

// Phase 12's client-side flow described using a stored refresh_token to get
// a fresh id_token "via Google's OAuth token endpoint" directly from
// Electron — but that grant requires the client secret for a confidential
// (Desktop app) client like this one, and the secret has never left the
// backend (see docs/GOOGLE_DRIVE_SETUP.md). So this has to happen here
// instead: the client sends its stored refresh_token to the backend, the
// backend does the actual refresh with its secret, and hands back a new
// id_token the client can store. See routes/auth.js's POST /google, which
// accepts this as an alternative to a fresh idToken.
async function refreshIdToken(refreshToken) {
  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials // { access_token, id_token, expiry_date, refresh_token? }
}

module.exports = { getAuthUrl, exchangeCode, getAuthenticatedClient, refreshIdToken }
