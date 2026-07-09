const { google } = require('googleapis')

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  )
}

function getAuthUrl() {
  const oauth2Client = createOAuthClient()
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
// is stateless with respect to any one user's Google identity.
async function exchangeCode(code) {
  const oauth2Client = createOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
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
