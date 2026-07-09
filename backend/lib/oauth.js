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

module.exports = { getAuthUrl, exchangeCode, getAuthenticatedClient }
