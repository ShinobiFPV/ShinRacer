import { useCallback, useEffect, useRef, useState } from 'react'
import httpApi from '../lib/api'

// Spotify Web Playback SDK integration (Car Stereo, Phase 18). The SDK
// itself is loaded via a <script> tag in index.html (not npm — see its CSP
// entry), so `window.Spotify` only exists once that tag's fetch resolves;
// everything here tolerates it never showing up (no internet, ad blocker,
// whatever) by simply never connecting, same as every other optional
// integration in this app.
//
// Token exchange/refresh are proxied through the backend so the Spotify app's
// client_secret never reaches this process (backend/routes/stereo.js) — same
// principle as Google OAuth. The authorize URL itself is safe to build
// client-side (client_id isn't secret), fetched from
// GET /api/stereo/spotify/client-id.
//
// Authorization Code flow with a PKCE challenge layered on top (defense in
// depth on top of the confidential client_secret already held server-side)
// — the loopback HTTP server that catches the redirect is the same pattern
// Phase 12's Google sign-in uses (src/main/main.js's
// 'auth:startCallbackServer'), just on port 9722 instead of 9721.
const REDIRECT_URI = 'http://127.0.0.1:9722'
const SCOPES = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'playlist-read-private',
  'user-read-recently-played',
  'user-top-read',
].join(' ')

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generatePkce() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64))
  const codeVerifier = base64url(verifierBytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return { codeVerifier, codeChallenge: base64url(digest) }
}

function isExpired(expiryDate) {
  return !expiryDate || Date.now() > expiryDate - 60000
}

export function useSpotify() {
  const [player, setPlayer] = useState(null)
  const [sdkState, setSdkState] = useState(null) // raw Spotify player_state_changed payload
  const [deviceId, setDeviceId] = useState(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)
  const tokensRef = useRef(null) // { accessToken, refreshToken, expiryDate }
  const codeVerifierRef = useRef(null)
  const playerRef = useRef(null)

  const loadStoredAuth = useCallback(async () => {
    const stored = await window.api.store.get('spotifyAuth')
    if (stored?.accessToken) {
      tokensRef.current = stored
      setUser(stored.user || null)
      return stored
    }
    return null
  }, [])

  const persistAuth = useCallback(async (tokens, userInfo) => {
    const next = { ...tokens, user: userInfo ?? tokensRef.current?.user ?? null }
    tokensRef.current = next
    if (userInfo) setUser(userInfo)
    await window.api.store.set('spotifyAuth', next)
  }, [])

  // Always returns a live token, refreshing first if the cached one is
  // stale — this is what the SDK Player's getOAuthToken callback calls on
  // every (re)connect, so the player itself never has to know about refresh.
  const getFreshToken = useCallback(async () => {
    const tokens = tokensRef.current || (await loadStoredAuth())
    if (!tokens?.refreshToken) return tokens?.accessToken || null
    if (!isExpired(tokens.expiryDate)) return tokens.accessToken
    try {
      const { data } = await httpApi.post('/api/stereo/spotify/refresh', { refreshToken: tokens.refreshToken })
      if (!data.ok) throw new Error(data.error)
      await persistAuth(data.data)
      return data.data.accessToken
    } catch (e) {
      setError(`Spotify session expired: ${e.message}`)
      return null
    }
  }, [loadStoredAuth, persistAuth])

  // Bootstrap: load any saved session, and — once the SDK script has
  // finished loading — wire up the player.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const stored = await loadStoredAuth()
      if (!stored) return
      initPlayer()
    })()

    function initPlayer() {
      if (playerRef.current || !window.Spotify) return
      const p = new window.Spotify.Player({
        name: 'ShinRacer',
        getOAuthToken: (cb) => { getFreshToken().then(t => t && cb(t)) },
        volume: 0.8,
      })
      p.addListener('ready', ({ device_id }) => {
        if (cancelled) return
        setDeviceId(device_id)
        setConnected(true)
        setError(null)
        getFreshToken().then(token => {
          if (!token) return
          fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [device_id], play: false }),
          }).catch(() => {})
        })
      })
      p.addListener('not_ready', () => setConnected(false))
      p.addListener('initialization_error', ({ message }) => setError(message))
      p.addListener('authentication_error', ({ message }) => setError(message))
      p.addListener('account_error', ({ message }) => setError('Spotify Premium is required for playback control: ' + message))
      p.addListener('player_state_changed', (state) => setSdkState(state))
      p.connect()
      playerRef.current = p
      setPlayer(p)
    }

    // The SDK script tag calls this global once it's loaded — if it already
    // fired before this effect ran (fast reload), window.Spotify is already set.
    window.onSpotifyWebPlaybackSDKReady = initPlayer
    if (window.Spotify) initPlayer()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await window.api.spotify.startAuth()
      const { data: idData } = await httpApi.get('/api/stereo/spotify/client-id')
      if (!idData.ok) throw new Error(idData.error)
      const { codeVerifier, codeChallenge } = await generatePkce()
      codeVerifierRef.current = codeVerifier
      const url = new URL('https://accounts.spotify.com/authorize')
      url.searchParams.set('client_id', idData.data.clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', REDIRECT_URI)
      url.searchParams.set('scope', SCOPES)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('code_challenge', codeChallenge)
      await window.api.shell.openExternal(url.toString())
    } catch (e) {
      setConnecting(false)
      setError(e.response?.data?.error || e.message)
    }
  }, [])

  // Loopback callback listener — lives for the hook's whole lifetime (not
  // just while connect() is pending) since the singleton hook only mounts once.
  useEffect(() => {
    const unsub = window.api.spotify.onCallback(async (code) => {
      try {
        const { data } = await httpApi.post('/api/stereo/spotify/token', {
          code, codeVerifier: codeVerifierRef.current, redirectUri: REDIRECT_URI,
        })
        if (!data.ok) throw new Error(data.error)
        await persistAuth(data.data)
        // Fetch profile directly from Spotify — no secret involved, just the
        // access token we just received. Cosmetic only: connection still
        // succeeds even if this fails.
        try {
          const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${data.data.accessToken}` } })
          const me = await meRes.json()
          await persistAuth(data.data, { id: me.id, name: me.display_name, image: me.images?.[0]?.url || null })
        } catch (e) { /* profile fetch is cosmetic */ }
        setConnecting(false)
        if (window.Spotify && !playerRef.current) window.onSpotifyWebPlaybackSDKReady?.()
      } catch (e) {
        setConnecting(false)
        setError(e.response?.data?.error || e.message)
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disconnect = useCallback(async () => {
    playerRef.current?.disconnect()
    playerRef.current = null
    setPlayer(null)
    setConnected(false)
    setDeviceId(null)
    setUser(null)
    tokensRef.current = null
    setSdkState(null)
    await window.api.store.set('spotifyAuth', null)
  }, [])

  const track = sdkState?.track_window?.current_track
  const nowPlaying = track ? {
    trackName: track.name,
    artist: track.artists?.[0]?.name,
    album: track.album?.name,
    artworkUrl: track.album?.images?.[0]?.url || null,
    durationMs: sdkState.duration,
    positionMs: sdkState.position,
    isPaused: sdkState.paused,
    shuffle: sdkState.shuffle,
    repeatMode: sdkState.repeat_mode,
  } : null

  return {
    connected, connecting, deviceId, user, error, nowPlaying,
    isPlaying: !!nowPlaying && !nowPlaying.isPaused,
    configured: true, // Sources tab checks GET /api/stereo/spotify/client-id itself for real config status
    connect, disconnect,
    play: () => player?.resume(),
    pause: () => player?.pause(),
    next: () => player?.nextTrack(),
    prev: () => player?.previousTrack(),
    seek: (ms) => player?.seek(ms),
    setVolume: (v) => player?.setVolume(v), // 0-1
    setShuffle: async (on) => {
      const token = await getFreshToken()
      if (!token) return
      fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${on}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    },
    setRepeat: async (mode) => { // 'off' | 'track' | 'context'
      const token = await getFreshToken()
      if (!token) return
      fetch(`https://api.spotify.com/v1/me/player/repeat?state=${mode}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    },
    getToken: getFreshToken,
  }
}
