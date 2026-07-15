import api from './api'
import { sha256 } from './sha256'

const AUTH_KEY = 'shinracer_auth'
const IDENTITY_KEY = 'shinracer_identity'
const ONBOARDED_KEY = 'shinracer_onboarded'

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
// 'openid' is required for Google to include an id_token in the token
// response — every backend route now verifies that id_token (Phase 12's
// requireAuth), not just the Drive-scoped access_token this flow originally
// existed for. Without it, exchangeCode() below would still "succeed" but
// hand back a session with no id_token, and every subsequent API/socket call
// would 401.
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Round-trips { verifier, returnTo } through OAuth's own `state` parameter
// instead of any browser storage. This replaced a sessionStorage stash, then
// a localStorage stash, neither of which actually worked: an installed
// (home-screen) PWA on iOS can run the navigation to accounts.google.com in
// a genuinely separate WebKit storage partition from the one that receives
// Google's redirect back — sessionStorage *and* localStorage both go empty
// across that boundary, which is what "Sign-in session expired" actually
// was on a phone that never did anything wrong. `state` has no such
// problem: Google is contractually required to echo it back verbatim on
// the query string of its own redirect, so the data travels in the URL
// itself rather than through any storage API. `redirectUri` doesn't need
// to be part of this — it isn't user-specific, the callback page re-fetches
// the same server-configured value from GET /api/auth/config.
function encodeState(payload) {
  return base64url(new TextEncoder().encode(JSON.stringify(payload)))
}

function decodeState(state) {
  try {
    const binary = atob(state.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

// Standard PKCE (RFC 7636): a random verifier, and its SHA-256 challenge sent
// up front so the token exchange can later prove possession of the verifier
// instead of a client secret (which a browser-based app can't keep secret).
//
// crypto.subtle (SubtleCrypto) only exists in a secure context — HTTPS or
// localhost. This app is commonly reached over plain http://<LAN IP> or a
// Tailscale IP, where crypto.subtle is undefined outright, not just
// erroring — which broke sign-in completely rather than just the PKCE
// step. crypto.getRandomValues has no such restriction, so only the digest
// needs the pure-JS fallback (./sha256.js, verified against Node's real
// crypto module across the SHA-256 padding boundary cases before use).
export async function generatePKCE() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(verifierBytes)
  const verifierUtf8 = new TextEncoder().encode(verifier)
  const digestBytes = window.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', verifierUtf8))
    : sha256(verifierUtf8)
  const challenge = base64url(digestBytes)
  return { verifier, challenge }
}

export function buildGoogleAuthUrl(clientId, redirectUri, challenge, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`
}

// Called right before redirecting to Google — encodes the verifier and
// where to send the user back to once signed in into the `state` string
// that travels through Google's own redirect (see encodeState above).
export function buildAuthState(verifier, returnTo) {
  return encodeState({ verifier, returnTo })
}

// Called on the callback page — the inverse of buildAuthState. Returns null
// on a missing/corrupt state rather than throwing, same "never trust
// external input" posture as every other parse in this file.
export function parseAuthState(state) {
  return state ? decodeState(state) : null
}

export async function exchangeCode(code, verifier, redirectUri) {
  const { data } = await api.post('/api/mods/auth/callback', { code, codeVerifier: verifier, redirectUri })
  if (!data.ok) throw new Error(data.error || 'Sign-in failed')
  let auth = data.data
  // Registers this Google account in the users table and resolves its role
  // (admin/host/crew) — same call the Electron app makes after exchange.
  // Not strictly required for baseline API access (requireAuth resolves role
  // from the id_token alone on every request), but without it an admin never
  // sees PWA-only users in the Admin panel's Crew Management table.
  try {
    const { data: roleRes } = await api.post('/api/auth/google', { idToken: auth.tokens.id_token })
    if (roleRes.ok) auth = { ...auth, role: roleRes.data.role }
  } catch { /* role registration is best-effort — sign-in itself already succeeded */ }
  setStoredAuth(auth)
  return auth
}

// The one token every authenticated request/socket connection needs —
// verified server-side on every use via Google's tokeninfo endpoint
// (backend/middleware/auth.js), never trusted just because it's present here.
export function getIdToken() {
  return getStoredAuth()?.tokens?.id_token || null
}

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
}

export function isTokenExpired(tokens) {
  if (!tokens?.expiry_date) return true
  return Date.now() >= tokens.expiry_date
}

// Identity (handle + color) is separate from Google sign-in — guests and
// signed-in users alike need one to appear in Events/Comms. Google auth only
// gates mod uploads.
export function getIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setIdentity(identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
}

export function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY)
}

// Separate from identity — a guest completes onboarding with no identity at
// all (view-only access), so the "has onboarding run" gate can't be "has an
// identity" the way it is in the Electron app.
export function isOnboarded() {
  return localStorage.getItem(ONBOARDED_KEY) === 'true'
}

export function setOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, 'true')
}
