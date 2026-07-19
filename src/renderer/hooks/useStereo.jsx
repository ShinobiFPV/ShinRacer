import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSpotify } from './useSpotify'

// Car Stereo (Phase 18) — one shared playback/mixer state for both StereoView
// and the Cluster Fucker's audio widgets. Must be a true singleton (one
// AudioContext, one Spotify Player, one YTM/Apple poll loop) — enforced by
// only ever constructing it inside <StereoProvider>, mounted once in
// App.jsx's Inner, with useStereo() as the plain context consumer everywhere
// else. The Cluster Fucker's separate overlay BrowserWindow can't reach this
// context at all (different renderer process) — it gets a lightweight
// mirrored snapshot over IPC instead; see the stereo:pushState bridge below
// and ClusterOverlay.jsx.

// Same exe names gameDetector.js's EXE_NAMES already uses (main.js is
// CommonJS, this is an ES module — duplicated rather than shared across that
// boundary, same reasoning as OAUTH_CALLBACK_PORT elsewhere in this app).
const GAME_PROCESS_MAP = {
  ac1: 'acs.exe', acc: 'AC2.exe', acevo: 'ACEvo.exe', acrally: 'ACRally.exe',
  fh5: 'ForzaHorizon5.exe', fh6: 'ForzaHorizon6.exe', f125: 'F1_25.exe', ams2: 'AMS2AVX.exe',
}

const DEFAULT_VOLUMES = { music: 80, game: 70, comms: 100, master: 100 }
const DEFAULT_MUTED = { music: false, game: false, comms: false }

const BUILTIN_PRESETS = [
  { id: 'race', name: 'RACE', builtin: true, volumes: { music: 60, game: 80, comms: 100 } },
  { id: 'cruise', name: 'CRUISE', builtin: true, volumes: { music: 90, game: 40, comms: 80 } },
  { id: 'stream', name: 'STREAM', builtin: true, volumes: { music: 70, game: 60, comms: 100 } },
  { id: 'quiet', name: 'QUIET', builtin: true, volumes: { music: 30, game: 50, comms: 100 } },
]

const YTM_POLL_MS = 2000
const STATE_PUSH_MS = 500 // throttle for mirroring to the cluster overlay window

function useStereoInternal() {
  const spotify = useSpotify()

  const [activeSource, setActiveSourceState] = useState('spotify')
  const [volumes, setVolumesState] = useState(DEFAULT_VOLUMES)
  const [muted, setMuted] = useState(DEFAULT_MUTED)
  const [solo, setSolo] = useState(false) // music-only solo, per spec
  const [linked, setLinked] = useState(false)
  const [presets, setPresets] = useState(BUILTIN_PRESETS)
  const [activeGame, setActiveGame] = useState(null)
  const [nircmdAvailable, setNircmdAvailable] = useState(true)

  const [ytmNowPlaying, setYtmNowPlaying] = useState(null)
  const [ytmPlaying, setYtmPlaying] = useState(false)
  const [appleNowPlaying, setAppleNowPlaying] = useState(null)
  const [applePlaying, setApplePlaying] = useState(false)

  const [localFolder, setLocalFolder] = useState(null)
  const [localLibrary, setLocalLibrary] = useState([])
  const [localScanning, setLocalScanning] = useState(false)
  const [queue, setQueue] = useState([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [localPlaying, setLocalPlaying] = useState(false)
  const [localPosition, setLocalPosition] = useState(0)

  // ── Single AudioContext + local-file audio graph — created once, outside
  // the render cycle, per the "ONE AudioContext per session" constraint. ────
  const audioElRef = useRef(null)
  const ctxRef = useRef(null)
  const musicGainRef = useRef(null)
  const musicAnalyserRef = useRef(null)
  const commsGainMultiplierRef = useRef(1) // dispatched to CommsView, see setVolume('comms', ...)

  useEffect(() => {
    const audioEl = new Audio()
    audioEl.crossOrigin = 'anonymous'
    audioElRef.current = audioEl
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const source = ctx.createMediaElementSource(audioEl)
    const gain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(gain)
    gain.connect(analyser)
    analyser.connect(ctx.destination)
    ctxRef.current = ctx
    musicGainRef.current = gain
    musicAnalyserRef.current = analyser

    const onEnded = () => nextLocalRef.current?.()
    const onTimeUpdate = () => setLocalPosition(audioEl.currentTime * 1000)
    audioEl.addEventListener('ended', onEnded)
    audioEl.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      audioEl.pause()
      audioEl.removeEventListener('ended', onEnded)
      audioEl.removeEventListener('timeupdate', onTimeUpdate)
      ctx.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persisted state (identity-scoped-free — one crew member per machine) ──
  useEffect(() => {
    window.api.store.get('stereoVolumes').then(v => v && setVolumesState({ ...DEFAULT_VOLUMES, ...v }))
    window.api.store.get('stereoActiveSource').then(v => v && setActiveSourceState(v))
    window.api.store.get('stereoMixerPresets').then(v => v && setPresets([...BUILTIN_PRESETS, ...v]))
    window.api.store.get('stereoLocalFolder').then(v => v && setLocalFolder(v))
    window.api.audio.nircmdStatus().then(res => setNircmdAvailable(!!res.found))
  }, [])

  const persistVolumes = useCallback((next) => { window.api.store.set('stereoVolumes', next) }, [])

  // ── Active game (for the GAME channel's label + nircmd target process) ───
  useEffect(() => {
    const tick = () => window.api.audio.getActiveGame().then(setActiveGame)
    tick()
    const interval = setInterval(tick, 5000)
    return () => clearInterval(interval)
  }, [])

  // ── YTM / Apple now-playing polling — only while that source is active ───
  useEffect(() => {
    if (activeSource !== 'ytm') return
    const tick = () => window.api.ytm.getNowPlaying().then(res => {
      if (res.ok && res.data) { setYtmNowPlaying(res.data); setYtmPlaying(!!res.data.playing) }
    })
    tick()
    const interval = setInterval(tick, YTM_POLL_MS)
    return () => clearInterval(interval)
  }, [activeSource])

  useEffect(() => {
    if (activeSource !== 'apple') return
    const tick = () => window.api.apple.getNowPlaying().then(res => {
      if (res.ok && res.data) { setAppleNowPlaying(res.data); setApplePlaying(!!res.data.playing) }
    })
    tick()
    const interval = setInterval(tick, YTM_POLL_MS)
    return () => clearInterval(interval)
  }, [activeSource])

  // ── Local library scan ────────────────────────────────────────────────────
  const scanLocalFolder = useCallback(async (folder) => {
    const target = folder || localFolder
    if (!target) return
    setLocalScanning(true)
    const res = await window.api.local.scanFolder(target)
    if (res.ok) {
      const withMeta = await Promise.all(res.files.map(async (f) => {
        const meta = await window.api.local.getMetadata(f.path)
        return { ...f, ...(meta.ok ? meta.data : { title: f.filename, artist: 'Unknown', album: 'Unknown', duration: 0, picture: null }) }
      }))
      setLocalLibrary(withMeta)
    }
    setLocalScanning(false)
    return res
  }, [localFolder])

  const setLocalFolderAndScan = useCallback((folder) => {
    setLocalFolder(folder)
    window.api.store.set('stereoLocalFolder', folder)
    scanLocalFolder(folder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Local transport ────────────────────────────────────────────────────────
  const playLocalTrack = useCallback(async (track, queueList) => {
    if (queueList) setQueue(queueList)
    const list = queueList || queue
    const idx = list.findIndex(t => t.path === track.path)
    setQueueIndex(idx >= 0 ? idx : 0)
    const audioEl = audioElRef.current
    const urlRes = await window.api.local.getFileUrl(track.path)
    audioEl.src = urlRes.url
    ctxRef.current?.resume().catch(() => {})
    await audioEl.play().catch(() => {})
    setLocalPlaying(true)
  }, [queue])

  const nextLocal = useCallback(() => {
    if (!queue.length) return
    const next = (queueIndex + 1) % queue.length
    playLocalTrack(queue[next], queue)
  }, [queue, queueIndex, playLocalTrack])
  const nextLocalRef = useRef(nextLocal)
  useEffect(() => { nextLocalRef.current = nextLocal }, [nextLocal])

  const prevLocal = useCallback(() => {
    if (!queue.length) return
    const prev = (queueIndex - 1 + queue.length) % queue.length
    playLocalTrack(queue[prev], queue)
  }, [queue, queueIndex, playLocalTrack])

  // ── Unified transport dispatch (activeSource-aware) ───────────────────────
  const play = useCallback(() => {
    if (activeSource === 'spotify') spotify.play()
    else if (activeSource === 'ytm') window.api.ytm.play()
    else if (activeSource === 'apple') window.api.apple.play()
    else if (activeSource === 'local') { audioElRef.current?.play(); setLocalPlaying(true) }
  }, [activeSource, spotify])

  const pause = useCallback(() => {
    if (activeSource === 'spotify') spotify.pause()
    else if (activeSource === 'ytm') window.api.ytm.play() // YTM's button is a toggle — no separate pause call
    else if (activeSource === 'apple') window.api.apple.play()
    else if (activeSource === 'local') { audioElRef.current?.pause(); setLocalPlaying(false) }
  }, [activeSource, spotify])

  const next = useCallback(() => {
    if (activeSource === 'spotify') spotify.next()
    else if (activeSource === 'ytm') window.api.ytm.next()
    else if (activeSource === 'apple') window.api.apple.next()
    else if (activeSource === 'local') nextLocal()
  }, [activeSource, spotify, nextLocal])

  const prev = useCallback(() => {
    if (activeSource === 'spotify') spotify.prev()
    else if (activeSource === 'ytm') window.api.ytm.prev()
    else if (activeSource === 'apple') window.api.apple.prev()
    else if (activeSource === 'local') prevLocal()
  }, [activeSource, spotify, prevLocal])

  const seek = useCallback((ms) => {
    if (activeSource === 'spotify') spotify.seek(ms)
    else if (activeSource === 'local' && audioElRef.current) audioElRef.current.currentTime = ms / 1000
  }, [activeSource, spotify])

  const setActiveSource = useCallback((src) => {
    setActiveSourceState(src)
    window.api.store.set('stereoActiveSource', src)
  }, [])

  // ── Mixer volumes ─────────────────────────────────────────────────────────
  const applyChannelVolume = useCallback((channel, pct, masterPct) => {
    const effective = (pct / 100) * (masterPct / 100)
    if (channel === 'music') {
      if (activeSource === 'spotify') spotify.setVolume(effective)
      else if (activeSource === 'local' && musicGainRef.current) musicGainRef.current.gain.value = effective
      else if ((activeSource === 'ytm' || activeSource === 'apple')) {
        // Neither has a per-app Web Audio hook — the BrowserView's audio
        // shares the app's own process, so this is the app's overall volume,
        // not a true per-source channel. Disclosed in the Sources tab.
        window.api.audio.setAppVolume({ processName: 'ShinRacer.exe', volume: Math.round(effective * 100) })
      }
    } else if (channel === 'game') {
      const proc = GAME_PROCESS_MAP[activeGame]
      if (proc) window.api.audio.setAppVolume({ processName: proc, volume: Math.round(effective * 100) }).then(res => {
        if (res && res.ok === false && /not found/i.test(res.error || '')) setNircmdAvailable(false)
      })
    } else if (channel === 'comms') {
      commsGainMultiplierRef.current = effective
      window.dispatchEvent(new CustomEvent('stereo:commsVolume', { detail: effective }))
    }
  }, [activeSource, activeGame, spotify])

  const setVolume = useCallback((channel, value) => {
    setVolumesState(prev => {
      let next = { ...prev, [channel]: value }
      if (linked && channel !== 'master' && !muted[channel]) {
        const delta = value - prev[channel]
        for (const c of ['music', 'game', 'comms']) {
          if (c === channel) continue
          next[c] = Math.max(0, Math.min(100, prev[c] + delta))
        }
      }
      persistVolumes(next)
      for (const c of channel === 'master' ? ['music', 'game', 'comms'] : [channel])
        if (!muted[c]) applyChannelVolume(c, next[c], next.master)
      return next
    })
  }, [linked, muted, persistVolumes, applyChannelVolume])

  const toggleMute = useCallback((channel) => {
    setMuted(prev => {
      const next = { ...prev, [channel]: !prev[channel] }
      applyChannelVolume(channel, next[channel] ? 0 : volumes[channel], volumes.master)
      return next
    })
  }, [volumes, applyChannelVolume])

  const toggleSolo = useCallback(() => {
    setSolo(s => {
      const next = !s
      for (const c of ['game', 'comms']) applyChannelVolume(c, next ? 0 : volumes[c], volumes.master)
      applyChannelVolume('music', volumes.music, volumes.master)
      return next
    })
  }, [volumes, applyChannelVolume])

  const applyPreset = useCallback((preset) => {
    setVolumesState(prev => {
      const next = { ...prev, ...preset.volumes }
      persistVolumes(next)
      for (const c of ['music', 'game', 'comms']) if (!muted[c]) applyChannelVolume(c, next[c], next.master)
      return next
    })
  }, [muted, persistVolumes, applyChannelVolume])

  const savePreset = useCallback((name) => {
    setPresets(prev => {
      const custom = prev.filter(p => !p.builtin)
      const nextCustom = [...custom, { id: `custom_${Date.now()}`, name, builtin: false, volumes: { music: volumes.music, game: volumes.game, comms: volumes.comms } }]
      window.api.store.set('stereoMixerPresets', nextCustom)
      return [...BUILTIN_PRESETS, ...nextCustom]
    })
  }, [volumes])

  const deletePreset = useCallback((id) => {
    setPresets(prev => {
      const nextCustom = prev.filter(p => !p.builtin && p.id !== id)
      window.api.store.set('stereoMixerPresets', nextCustom)
      return [...BUILTIN_PRESETS, ...nextCustom]
    })
  }, [])

  // ── Cluster Fucker: 'stereo.*' appFunctions arrive here as window
  // CustomEvents — same pattern as CommsView's ptt.start/mute.toggle
  // listeners (see App.jsx's cluster:invoke dispatcher). ─────────────────────
  useEffect(() => {
    const onPlay = () => play()
    const onPause = () => pause()
    const onPlayPause = () => (isPlayingRef.current ? pause() : play())
    const onNext = () => next()
    const onPrev = () => prev()
    const onVolume = (e) => { if (e.detail?.channel) setVolume(e.detail.channel, e.detail.value) }
    window.addEventListener('cluster:stereo.play', onPlay)
    window.addEventListener('cluster:stereo.pause', onPause)
    window.addEventListener('cluster:stereo.playPause', onPlayPause)
    window.addEventListener('cluster:stereo.next', onNext)
    window.addEventListener('cluster:stereo.prev', onPrev)
    window.addEventListener('cluster:stereo.volumeSet', onVolume)
    return () => {
      window.removeEventListener('cluster:stereo.play', onPlay)
      window.removeEventListener('cluster:stereo.pause', onPause)
      window.removeEventListener('cluster:stereo.playPause', onPlayPause)
      window.removeEventListener('cluster:stereo.next', onNext)
      window.removeEventListener('cluster:stereo.prev', onPrev)
      window.removeEventListener('cluster:stereo.volumeSet', onVolume)
    }
  }, [play, pause, next, prev, setVolume])

  // ── Combined now-playing / isPlaying across whichever source is active ───
  const nowPlaying = activeSource === 'spotify' ? spotify.nowPlaying
    : activeSource === 'ytm' ? (ytmNowPlaying ? { trackName: ytmNowPlaying.title, artist: ytmNowPlaying.artist, album: ytmNowPlaying.album, artworkUrl: ytmNowPlaying.artwork } : null)
    : activeSource === 'apple' ? (appleNowPlaying ? { trackName: appleNowPlaying.title, artist: appleNowPlaying.artist, album: appleNowPlaying.album, artworkUrl: appleNowPlaying.artwork } : null)
    : activeSource === 'local' ? (queue[queueIndex] ? { trackName: queue[queueIndex].title, artist: queue[queueIndex].artist, album: queue[queueIndex].album, artworkUrl: queue[queueIndex].picture, durationMs: queue[queueIndex].duration * 1000, positionMs: localPosition } : null)
    : null

  const isPlaying = activeSource === 'spotify' ? spotify.isPlaying
    : activeSource === 'ytm' ? ytmPlaying
    : activeSource === 'apple' ? applePlaying
    : activeSource === 'local' ? localPlaying
    : false

  const isPlayingRef = useRef(isPlaying)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // ── Mirror a lightweight snapshot to the Cluster Fucker's overlay window —
  // it's a separate BrowserWindow/renderer with no access to this context. ──
  const lastPushRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    const send = () => window.api.stereo.pushState({
      activeSource, nowPlaying, isPlaying, volumes, muted, activeGame,
    })
    if (now - lastPushRef.current >= STATE_PUSH_MS) { lastPushRef.current = now; send() }
    else { const t = setTimeout(send, STATE_PUSH_MS); return () => clearTimeout(t) }
  }, [activeSource, nowPlaying, isPlaying, volumes, muted, activeGame])

  return {
    // sources
    activeSource, setActiveSource,
    spotify, ytmNowPlaying, ytmPlaying, appleNowPlaying, applePlaying,
    // transport
    nowPlaying, isPlaying, play, pause, next, prev, seek,
    // local library
    localFolder, localLibrary, localScanning, scanLocalFolder, setLocalFolder: setLocalFolderAndScan,
    queue, queueIndex, setQueue, playLocalTrack,
    // mixer
    volumes, muted, solo, linked, setLinked, setVolume, toggleMute, toggleSolo,
    presets, applyPreset, savePreset, deletePreset,
    activeGame, nircmdAvailable,
    // web audio (for level-meter widgets)
    musicAnalyser: musicAnalyserRef.current,
  }
}

const StereoContext = createContext(null)

export function StereoProvider({ children }) {
  const value = useStereoInternal()
  return <StereoContext.Provider value={value}>{children}</StereoContext.Provider>
}

export function useStereo() {
  const ctx = useContext(StereoContext)
  if (!ctx) throw new Error('useStereo() must be called within <StereoProvider>')
  return ctx
}
