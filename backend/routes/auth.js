const express = require('express')

const router = express.Router()

// The PWA builds its own Google OAuth URL client-side (PKCE flow — see
// pwa/src/lib/auth.js), so it needs the client id and redirect URI but must
// never see the client secret. This is the one config value the Electron app
// never needed, since accomp://oauth is a fixed scheme, not a per-deployment URL.
router.get('/config', (req, res) => {
  res.json({
    ok: true,
    data: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI_PWA || null,
    },
  })
})

module.exports = router
