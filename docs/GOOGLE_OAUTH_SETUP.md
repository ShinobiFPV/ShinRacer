# Google OAuth Setup

ShinRacer's Electron app signs everyone in with Google (mandatory since
Phase 12 — see `docs/ADMIN_SETUP.md`). Sign-in uses the same OAuth 2.0 client
the Mod Manager's uploads already use (see `docs/GOOGLE_DRIVE_SETUP.md`,
section 3) — there's only one OAuth client for the whole app, not a separate
one per feature.

## Add the redirect URI

Go to [console.cloud.google.com](https://console.cloud.google.com) →
**APIs & Services → Credentials** → open your OAuth 2.0 Client.

Under **Authorized redirect URIs**, make sure this is present:

```
accomp://oauth
```

Save.

Without this, Google rejects the OAuth callback with
`redirect_uri_mismatch` the moment a crew member clicks "Sign in with
Google."

This is the same redirect URI `docs/GOOGLE_DRIVE_SETUP.md` (section 3)
already has you add when setting up the OAuth client for Mod Manager
uploads — if you've already done that setup, sign-in is already configured
and there's nothing further to do here.

## Sign-in error handling

If sign-in fails with an error message containing `redirect_uri_mismatch`,
the Wizard shows:

> OAuth not configured — see docs/GOOGLE_OAUTH_SETUP.md

pointing back at this file, instead of the raw Google error text.
