import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, Btn, Card, SectionHead, Label, TextInput, Select, TabBar, Tag } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { useStereo } from '../hooks/useStereo'
import httpApi from '../lib/api'

const SOURCE_META = {
  spotify: { label: 'SPOTIFY', color: '#1DB954' },
  ytm:     { label: 'YTM',     color: '#FF0000' },
  apple:   { label: 'APPLE',   color: '#FC3C44' },
  local:   { label: 'LOCAL',   color: C.blue },
}

function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '--:--'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function SourceBadge({ source, size = 9 }) {
  const meta = SOURCE_META[source] || SOURCE_META.local
  return (
    <span style={{ fontFamily: C.mono, fontSize: size, fontWeight: 700, letterSpacing: 1,
      color: meta.color, border: `1px solid ${meta.color}`, padding: '2px 5px', background: `${meta.color}18` }}>
      {meta.label}
    </span>
  )
}

function NoteIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M9 18V5l11-2v13" stroke={C.muted} strokeWidth="1.5" />
      <circle cx="6" cy="18" r="3" stroke={C.muted} strokeWidth="1.5" />
      <circle cx="17" cy="16" r="3" stroke={C.muted} strokeWidth="1.5" />
    </svg>
  )
}

// ── Top zone: Now Playing dashboard ─────────────────────────────────────────
function NowPlayingBar({ stereo }) {
  const { activeSource, setActiveSource, nowPlaying, isPlaying, play, pause, next, prev, seek, volumes, setVolume } = stereo
  const meta = SOURCE_META[activeSource]
  const spotifyExtra = activeSource === 'spotify' ? stereo.spotify : null

  const seekRel = (deltaMs) => {
    if (!nowPlaying) return
    seek(Math.max(0, (nowPlaying.positionMs || 0) + deltaMs))
  }

  const progressPct = nowPlaying?.durationMs ? Math.min(100, ((nowPlaying.positionMs || 0) / nowPlaying.durationMs) * 100) : 0

  const onProgressClick = (e) => {
    if (!nowPlaying?.durationMs) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(pct * nowPlaying.durationMs)
  }

  const knobRef = useRef(null)
  const onKnobDrag = (e) => {
    e.preventDefault()
    const rect = knobRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
    function move(ev) {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI)
      // Map -135..135 degrees (bottom gap) to 0..100
      let deg = angle + 90
      if (deg < 0) deg += 360
      let pct
      if (deg <= 270) pct = (deg / 270) * 100
      else pct = deg > 315 ? 0 : 100
      setVolume('music', Math.round(Math.max(0, Math.min(100, pct))))
    }
    function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const knobAngle = -135 + (volumes.music / 100) * 270

  return (
    <div style={{ height: 200, flexShrink: 0, display: 'flex', gap: 20, padding: '16px 24px',
      background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      {/* Album art */}
      <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
        {nowPlaying?.artworkUrl ? (
          <img src={nowPlaying.artworkUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', border: `1px solid ${C.border}` }} />
        ) : (
          <div style={{ width: 80, height: 80, background: C.raised, border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <NoteIcon />
          </div>
        )}
        <div style={{ position: 'absolute', bottom: -6, right: -6 }}>
          <SourceBadge source={activeSource} />
        </div>
      </div>

      {/* Track info + transport */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        <div style={{ fontFamily: C.head, fontSize: 22, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nowPlaying?.trackName || 'Nothing playing'}
        </div>
        <div style={{ fontFamily: C.body, fontSize: 14, color: C.mutedHi, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nowPlaying?.artist || '—'}
        </div>
        <div style={{ fontFamily: C.body, fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>
          {nowPlaying?.album || ''}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, width: 34 }}>{fmtMs(nowPlaying?.positionMs)}</span>
          <div onClick={onProgressClick} style={{ flex: 1, height: 3, background: C.border, cursor: 'pointer', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${progressPct}%`, background: C.blue }} />
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, width: 34, textAlign: 'right' }}>{fmtMs(nowPlaying?.durationMs)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <Tooltip text="Previous track"><button onClick={prev} style={iconBtnStyle(24)}>⏮</button></Tooltip>
          <Tooltip text="Back 10 seconds"><button onClick={() => seekRel(-10000)} style={iconBtnStyle(24)}>⏪</button></Tooltip>
          <Tooltip text={isPlaying ? 'Pause' : 'Play'}>
            <button onClick={isPlaying ? pause : play}
              style={{ ...iconBtnStyle(36), borderRadius: '50%', background: isPlaying ? C.blue : C.raised,
                border: `1px solid ${isPlaying ? C.blueDim : C.border}`, color: C.whiteHot,
                boxShadow: isPlaying ? `0 0 12px ${C.blueGlow}66` : 'none' }}>
              {isPlaying ? '❙❙' : '▶'}
            </button>
          </Tooltip>
          <Tooltip text="Forward 10 seconds"><button onClick={() => seekRel(10000)} style={iconBtnStyle(24)}>⏩</button></Tooltip>
          <Tooltip text="Next track"><button onClick={next} style={iconBtnStyle(24)}>⏭</button></Tooltip>
          <span style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />
          <Tooltip text="Shuffle (Spotify only)">
            <button onClick={() => spotifyExtra?.setShuffle(!nowPlaying?.shuffle)} disabled={activeSource !== 'spotify'}
              style={{ ...iconBtnStyle(20), color: nowPlaying?.shuffle ? C.blue : C.mutedHi, opacity: activeSource === 'spotify' ? 1 : 0.35 }}>🔀</button>
          </Tooltip>
          <Tooltip text="Repeat (Spotify only)">
            <button onClick={() => spotifyExtra?.setRepeat(nowPlaying?.repeatMode ? 'off' : 'context')} disabled={activeSource !== 'spotify'}
              style={{ ...iconBtnStyle(20), color: nowPlaying?.repeatMode ? C.blue : C.mutedHi, opacity: activeSource === 'spotify' ? 1 : 0.35 }}>🔁</button>
          </Tooltip>
        </div>
      </div>

      {/* Source selector + volume knob */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.keys(SOURCE_META).map(src => {
            const m = SOURCE_META[src]
            const active = activeSource === src
            return (
              <button key={src} onClick={() => setActiveSource(src)}
                style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '5px 8px',
                  background: active ? `${m.color}22` : 'transparent', color: active ? m.color : C.muted,
                  border: `1px solid ${active ? m.color : C.border}`, cursor: 'pointer' }}>
                {m.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: C.muted }}>MUSIC VOL</span>
          <div ref={knobRef} onMouseDown={onKnobDrag} style={{ width: 48, height: 48, cursor: 'ns-resize' }}>
            <svg width="48" height="48">
              <circle cx="24" cy="24" r="20" fill={C.raised} stroke={C.border} strokeWidth="2" />
              <line x1="24" y1="24"
                x2={24 + 16 * Math.sin((knobAngle * Math.PI) / 180)}
                y2={24 - 16 * Math.cos((knobAngle * Math.PI) / 180)}
                stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" />
              <text x="24" y="28" textAnchor="middle" fontSize="9" fill={C.textSec} fontFamily={C.mono}>{volumes.music}</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

function iconBtnStyle(size) {
  return { width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: C.mutedHi, fontSize: Math.round(size * 0.5), cursor: 'pointer', padding: 0 }
}

// ── Library: Spotify ─────────────────────────────────────────────────────────
function SpotifyLibrary({ stereo }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('track')
  const [results, setResults] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [recent, setRecent] = useState([])
  const [searching, setSearching] = useState(false)
  const spotify = stereo.spotify

  const spotifyHeaders = useCallback(async () => {
    const token = await spotify.getToken()
    return { 'X-Spotify-Token': token }
  }, [spotify])

  useEffect(() => {
    if (!spotify.connected) return
    spotifyHeaders().then(headers => {
      httpApi.get('/api/stereo/spotify/playlists', { headers }).then(({ data }) => data.ok && setPlaylists(data.data.items || []))
      httpApi.get('/api/stereo/spotify/recently-played', { headers }).then(({ data }) => data.ok && setRecent(data.data.items || []))
    })
  }, [spotify.connected, spotifyHeaders])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const headers = await spotifyHeaders()
      const { data } = await httpApi.get('/api/stereo/spotify/search', { params: { q: query, type: category }, headers })
      if (data.ok) {
        const key = category + 's'
        setResults(data.data[key]?.items || [])
      }
    } finally { setSearching(false) }
  }

  const playUri = async (uri, deviceId) => {
    const token = await spotify.getToken()
    if (!token || !deviceId) return
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] }),
    }).catch(() => {})
  }

  if (!spotify.connected) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
        <div style={{ fontFamily: C.head, fontSize: 20, color: C.textSec, marginBottom: 8 }}>NOT CONNECTED</div>
        <div style={{ marginBottom: 16 }}>Connect your Spotify Premium account in the Sources tab to browse and play.</div>
        <Btn onClick={spotify.connect} disabled={spotify.connecting}>{spotify.connecting ? 'Connecting…' : 'Connect Spotify'}</Btn>
        {spotify.error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{spotify.error}</div>}
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <TextInput value={query} onChange={setQuery} placeholder="Search Spotify…" onKeyDown={e => e.key === 'Enter' && search()} style={{ flex: 1 }} />
        <Btn size="sm" onClick={search} disabled={searching}>{searching ? '…' : 'Search'}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['track', 'album', 'playlist', 'artist'].map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{
            fontFamily: C.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '4px 12px',
            background: category === c ? `${C.blue}22` : 'transparent', color: category === c ? C.blue : C.muted,
            border: `1px solid ${category === c ? C.blue : C.border}`, cursor: 'pointer',
          }}>{c}s</button>
        ))}
      </div>

      {results.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Label muted>Results</Label>
          {results.map(item => (
            <div key={item.id} onClick={() => playUri(item.uri, spotify.deviceId)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = C.raised} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <img src={item.album?.images?.[2]?.url || item.images?.[2]?.url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', background: C.raised }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{item.artists?.map(a => a.name).join(', ') || item.owner?.display_name}</div>
              </div>
              {item.duration_ms && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{fmtMs(item.duration_ms)}</span>}
            </div>
          ))}
        </div>
      )}

      {playlists.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Label muted>Your playlists</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {playlists.slice(0, 12).map(p => (
              <div key={p.id} onClick={() => playUri(p.uri, spotify.deviceId)} style={{ cursor: 'pointer' }}>
                <img src={p.images?.[0]?.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', background: C.raised }} />
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <Label muted>Recently played</Label>
          {recent.slice(0, 8).map((r, i) => (
            <div key={i} onClick={() => playUri(r.track.uri, spotify.deviceId)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = C.raised} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <img src={r.track.album?.images?.[2]?.url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', background: C.raised }} />
              <div style={{ fontSize: 12, color: C.textSec }}>{r.track.name} — {r.track.artists?.[0]?.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Library: YTM / Apple (embedded BrowserView) ──────────────────────────────
function EmbeddedServiceLibrary({ service, stereo }) {
  const api = window.api[service]
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const updateBounds = useCallback(() => {
    if (!open || !containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    api.show({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) })
  }, [open, api])

  useEffect(() => {
    if (open) updateBounds()
    else api.hide()
    return () => { api.hide() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [updateBounds])

  const meta = SOURCE_META[service]

  return (
    <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: C.head, fontSize: 16, color: meta.color, marginBottom: 4 }}>{meta.label}</div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {service === 'ytm'
            ? 'YouTube Music is controlled via the embedded player. Use it below to browse and queue tracks — ShinRacer reads track info back via the transport controls up top.'
            : 'Apple Music is controlled via the embedded player below (native controls need an optional Developer token — see Settings).'}
        </div>
      </div>
      {!open ? (
        <Btn onClick={() => setOpen(true)}>Open {meta.label === 'YTM' ? 'YouTube Music' : 'Apple Music'}</Btn>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Btn size="sm" variant="ghost" onClick={() => setOpen(false)}>◀ Hide</Btn>
            <Btn size="sm" variant="subtle" onClick={() => api.play()}>⏯</Btn>
            <Btn size="sm" variant="subtle" onClick={() => api.next()}>⏭</Btn>
            <Tooltip text="Volume for this source is controlled by the mixer's MUSIC channel below">
              <Btn size="sm" variant="ghost">🔊</Btn>
            </Tooltip>
          </div>
          <div ref={containerRef} style={{ flex: 1, minHeight: 300, border: `1px solid ${C.border}`, background: '#000' }} />
        </>
      )}
    </div>
  )
}

// ── Library: Local files ──────────────────────────────────────────────────────
function LocalLibrary({ stereo }) {
  const { localFolder, setLocalFolder, localLibrary, localScanning, scanLocalFolder, playLocalTrack, queue, queueIndex } = stereo
  const [sort, setSort] = useState('title')
  const [search, setSearch] = useState('')

  const browse = async () => {
    const p = await window.api.dialog.openFolder({ title: 'Select music folder' })
    if (p) setLocalFolder(p)
  }

  const filtered = useMemo(() => {
    let list = [...localLibrary]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q))
    }
    list.sort((a, b) => (a[sort] || '').toString().localeCompare((b[sort] || '').toString()))
    return list
  }, [localLibrary, search, sort])

  const grouped = useMemo(() => {
    const g = {}
    for (const t of filtered) { (g[t.dir || '.'] ||= []).push(t) }
    return g
  }, [filtered])

  if (!localFolder) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
        <div style={{ fontFamily: C.head, fontSize: 20, color: C.textSec, marginBottom: 8 }}>NO FOLDER SELECTED</div>
        <div style={{ marginBottom: 16 }}>Choose a folder to scan for mp3, flac, wav, ogg, m4a, and aac files.</div>
        <Btn onClick={browse}>Choose folder</Btn>
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, flex: 1, minWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localFolder}</span>
        <Btn size="xs" variant="subtle" onClick={browse}>Change folder</Btn>
        <Btn size="xs" variant="subtle" onClick={() => scanLocalFolder()} disabled={localScanning}>{localScanning ? 'Scanning…' : 'Rescan'}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <TextInput value={search} onChange={setSearch} placeholder="Filter…" style={{ flex: 1 }} />
        <Select value={sort} onChange={setSort} options={[{ value: 'title', label: 'By title' }, { value: 'artist', label: 'By artist' }, { value: 'album', label: 'By album' }]} style={{ width: 150 }} />
      </div>
      {localScanning && localLibrary.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Scanning folder…</div>}
      {!localScanning && filtered.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>No audio files found</div>}
      {Object.entries(grouped).map(([dir, tracks]) => (
        <div key={dir} style={{ marginBottom: 16 }}>
          <Label muted>{dir === '.' ? '(root)' : dir}</Label>
          {tracks.map(t => {
            const isCurrent = queue[queueIndex]?.path === t.path
            return (
              <div key={t.path} onClick={() => playLocalTrack(t, filtered)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer',
                  color: isCurrent ? C.blue : C.textPrimary }}
                onMouseEnter={e => e.currentTarget.style.background = C.raised} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {t.picture ? <img src={t.picture} alt="" style={{ width: 32, height: 32, objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, background: C.raised }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isCurrent ? '▶ ' : ''}{t.title}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{t.artist} — {t.album}</div>
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{fmtMs(t.duration * 1000)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Library tab root ──────────────────────────────────────────────────────────
function LibraryTab({ stereo }) {
  if (stereo.activeSource === 'spotify') return <SpotifyLibrary stereo={stereo} />
  if (stereo.activeSource === 'ytm') return <EmbeddedServiceLibrary service="ytm" stereo={stereo} />
  if (stereo.activeSource === 'apple') return <EmbeddedServiceLibrary service="apple" stereo={stereo} />
  return <LocalLibrary stereo={stereo} />
}

// ── Queue tab (local-file queue — the only source ShinRacer actually owns
// a queue for; Spotify/YTM/Apple manage their own internally). ──────────────
function QueueTab({ stereo }) {
  const { queue, queueIndex, setQueue, playLocalTrack } = stereo
  const dragIdx = useRef(null)

  if (stereo.activeSource !== 'local') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
        {SOURCE_META[stereo.activeSource].label} manages its own queue in its own app — switch to LOCAL to use ShinRacer's queue.
      </div>
    )
  }
  if (queue.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Queue is empty — play a local track to start one.</div>
  }

  function onDrop(i) {
    if (dragIdx.current == null || dragIdx.current === i) return
    const next = [...queue]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(i, 0, moved)
    setQueue(next)
    dragIdx.current = null
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Label muted>Up next ({queue.length})</Label>
        <Btn size="xs" variant="danger" onClick={() => setQueue([])}>Clear queue</Btn>
      </div>
      {queue.map((t, i) => (
        <div key={t.path + i} draggable onDragStart={() => (dragIdx.current = i)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(i)}
          onClick={() => playLocalTrack(t, queue)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4, cursor: 'grab',
            background: i === queueIndex ? `${C.blue}14` : C.surface, border: `1px solid ${i === queueIndex ? C.blue : C.border}` }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, width: 20 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{t.artist}</div>
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{fmtMs(t.duration * 1000)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Sources tab ────────────────────────────────────────────────────────────
function SourcesTab({ stereo }) {
  const spotify = stereo.spotify
  const [ytmSignedIn, setYtmSignedIn] = useState(null)
  const [appleSignedIn, setAppleSignedIn] = useState(null)

  useEffect(() => {
    window.api.ytm.getNowPlaying().then(r => setYtmSignedIn(r.ok && !!r.data))
    window.api.apple.getNowPlaying().then(r => setAppleSignedIn(r.ok && !!r.data))
  }, [])

  return (
    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      <Card accent="#1DB954">
        <SectionHead>Spotify</SectionHead>
        {spotify.connected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {spotify.user?.image && <img src={spotify.user.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
              <div>
                <div style={{ fontSize: 13, color: C.textPrimary }}>{spotify.user?.name || 'Connected'}</div>
                <div style={{ fontSize: 11, color: C.green }}>Connected to Spotify</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Playing on device: ShinRacer</div>
            <Btn size="sm" variant="danger" onClick={spotify.disconnect}>Disconnect</Btn>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Requires Spotify Premium. Configure a Spotify app in Settings first.</div>
            <Btn onClick={spotify.connect} disabled={spotify.connecting}>{spotify.connecting ? 'Connecting…' : 'Connect with Spotify'}</Btn>
            {spotify.error && <div style={{ color: C.red, fontSize: 11, marginTop: 8 }}>{spotify.error}</div>}
          </>
        )}
      </Card>

      <Card accent="#FF0000">
        <SectionHead>YouTube Music</SectionHead>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          YouTube Music has no public API. ShinRacer uses an embedded browser — sign in once and it stays signed in.
        </div>
        <div style={{ fontSize: 11, marginBottom: 10, color: ytmSignedIn ? C.green : C.muted }}>
          {ytmSignedIn === null ? 'Checking…' : ytmSignedIn ? '✓ Signed in' : 'Not signed in yet'}
        </div>
        <Tag color="#FF0000">Open the LIBRARY tab to sign in</Tag>
      </Card>

      <Card accent="#FC3C44">
        <SectionHead>Apple Music</SectionHead>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          {appleSignedIn ? 'Signed in via the embedded player.' : 'Sign in through the embedded player in the LIBRARY tab.'}
        </div>
        <div style={{ fontSize: 11, marginBottom: 10, color: appleSignedIn ? C.green : C.muted }}>
          {appleSignedIn === null ? 'Checking…' : appleSignedIn ? '✓ Signed in' : 'Not signed in yet'}
        </div>
        <Tag color="#FC3C44">Native controls need a Developer token — see Settings</Tag>
      </Card>

      <Card accent={C.blue}>
        <SectionHead>Local files</SectionHead>
        <div style={{ fontSize: 12, color: C.mutedHi, marginBottom: 6 }}>{stereo.localFolder || 'No folder selected'}</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>{stereo.localLibrary.length} audio files found</div>
        <Btn size="sm" variant="subtle" onClick={() => stereo.scanLocalFolder()} disabled={!stereo.localFolder || stereo.localScanning}>
          {stereo.localScanning ? 'Rescanning…' : 'Rescan'}
        </Btn>
      </Card>
    </div>
  )
}

// ── Settings tab (Spotify app creds, Apple token, mixer presets, local
// folder, nircmd) — kept local to Car Stereo rather than duplicated into the
// app-wide Settings view, since it's all config for electron-store keys this
// page alone owns. ────────────────────────────────────────────────────────
function StereoSettingsTab({ stereo }) {
  const { showToast } = useStore()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [appleToken, setAppleToken] = useState('')
  const [nircmdStatus, setNircmdStatus] = useState(null)
  const [testingNircmd, setTestingNircmd] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [cacheCount, setCacheCount] = useState(0)

  useEffect(() => {
    window.api.store.get('appleDeveloperToken').then(v => setAppleToken(v || ''))
    window.api.audio.nircmdStatus().then(r => setNircmdStatus(r.found))
    setCacheCount(stereo.localLibrary.length)
  }, [stereo.localLibrary.length])

  const saveSpotifyCreds = async () => {
    if (!clientId || !clientSecret) { showToast('Client ID and Secret are both required', C.red); return }
    setSaving(true)
    try {
      const { data } = await httpApi.post('/api/stereo/spotify/configure', { clientId, clientSecret })
      if (data.ok) showToast('✓ Saved — click Connect Spotify in Sources')
      else showToast(data.error, C.red)
    } catch (e) {
      showToast(e.response?.data?.error || e.message, C.red)
    }
    setSaving(false)
  }

  const saveAppleToken = (v) => { setAppleToken(v); window.api.store.set('appleDeveloperToken', v) }

  const testNircmd = async () => {
    setTestingNircmd(true)
    const res = await window.api.audio.setAppVolume({ processName: 'nircmd-test-probe.exe', volume: 50 })
    setTestingNircmd(false)
    // A missing target process still means nircmd itself ran — only a
    // "not found" error means nircmd.exe itself is missing.
    showToast(res.ok || !/not found/i.test(res.error || '') ? '✓ nircmd.exe runs correctly' : '✕ nircmd.exe not found', res.ok || !/not found/i.test(res.error || '') ? C.green : C.red)
  }

  const clearMetadataCache = () => { window.api.store.set('stereoMetadataCache', null); showToast('Metadata cache cleared — rescan to rebuild it') }

  return (
    <div style={{ padding: 20, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card accent="#1DB954">
        <SectionHead children="Spotify" sub="Create a free app at developer.spotify.com/dashboard" />
        <Label>Client ID</Label>
        <div style={{ marginBottom: 12 }}><TextInput mono value={clientId} onChange={setClientId} placeholder="from developer.spotify.com" /></div>
        <Label>Client Secret</Label>
        <div style={{ marginBottom: 12 }}><TextInput mono value={clientSecret} onChange={setClientSecret} placeholder="••••••••••••••••" /></div>
        <Label muted>Redirect URI (add this exactly in your Spotify app settings)</Label>
        <div style={{ marginBottom: 12 }}><TextInput mono value="http://127.0.0.1:9722" onChange={() => {}} /></div>
        <Btn size="sm" onClick={saveSpotifyCreds} disabled={saving}>{saving ? 'Saving…' : 'Save & Connect'}</Btn>
      </Card>

      <Card accent="#FC3C44">
        <SectionHead children="Apple Music" sub="Optional — enables native playback controls" />
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
          Without this, Apple Music works via the embedded browser only. Generate a token at developer.apple.com → MusicKit ($99/yr Apple Developer account required).
        </div>
        <Label>Developer token (JWT)</Label>
        <TextInput mono value={appleToken} onChange={saveAppleToken} placeholder="eyJhbGciOi..." />
      </Card>

      <Card accent={C.blue}>
        <SectionHead children="Mixer presets" sub="RACE / CRUISE / STREAM / QUIET are built in — save your own on top" />
        {stereo.presets.filter(p => !p.builtin).map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>M{p.volumes.music} G{p.volumes.game} C{p.volumes.comms}</span>
            <Btn size="xs" variant="danger" onClick={() => stereo.deletePreset(p.id)}>Delete</Btn>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <TextInput value={newPresetName} onChange={setNewPresetName} placeholder="Preset name" style={{ flex: 1 }} />
          <Btn size="sm" variant="subtle" onClick={() => { if (newPresetName.trim()) { stereo.savePreset(newPresetName.trim()); setNewPresetName('') } }}>
            Save current mix as preset
          </Btn>
        </div>
      </Card>

      <Card accent={C.blue}>
        <SectionHead children="Local files" />
        <Label muted>Music folder</Label>
        <div style={{ fontSize: 12, color: C.mutedHi, marginBottom: 10 }}>{stereo.localFolder || 'Not set'}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Btn size="sm" variant="subtle" onClick={async () => { const p = await window.api.dialog.openFolder({ title: 'Select music folder' }); if (p) stereo.setLocalFolder(p) }}>Browse</Btn>
          <Btn size="sm" variant="subtle" onClick={() => stereo.scanLocalFolder()} disabled={!stereo.localFolder}>Rescan library</Btn>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Supported: mp3, flac, wav, ogg, m4a, aac. {cacheCount} tracks cached.</div>
        <Btn size="xs" variant="ghost" onClick={clearMetadataCache}>Clear metadata cache</Btn>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Game audio (nircmd)" sub="Required for the mixer's GAME channel" />
        <div style={{ fontSize: 13, color: nircmdStatus ? C.green : C.red, marginBottom: 10 }}>
          {nircmdStatus === null ? 'Checking…' : nircmdStatus ? '✓ nircmd.exe found' : '✕ nircmd.exe not found'}
        </div>
        {!nircmdStatus && (
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
            Download from <span style={{ color: C.blue }}>nirsoft.net/utils/nircmd.html</span> and place it in resources/tools/nircmd.exe
          </div>
        )}
        <Btn size="sm" variant="subtle" onClick={testNircmd} disabled={testingNircmd}>{testingNircmd ? 'Testing…' : 'Test'}</Btn>
      </Card>
    </div>
  )
}

// ── Bottom zone: Audio Mixer ──────────────────────────────────────────────
function useSimulatedLevel(active) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!active) { setLevel(0); return }
    let raf
    const tick = () => { setLevel(0.3 + Math.random() * 0.6); raf = setTimeout(tick, 120) }
    tick()
    return () => clearTimeout(raf)
  }, [active])
  return level
}

function useAnalyserLevel(analyser, active) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!analyser || !active) { setLevel(0); return }
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      setLevel(Math.min(1, avg / 90))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [analyser, active])
  return level
}

function VuBars({ level, muted }) {
  const segments = 12
  const lit = Math.round(level * segments)
  return (
    <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 1, width: 6, height: 80 }}>
      {Array.from({ length: segments }, (_, i) => {
        const on = !muted && i < lit
        const color = i > segments * 0.83 ? C.red : i > segments * 0.6 ? C.orange : C.green
        return <div key={i} style={{ flex: 1, background: on ? color : C.border, opacity: on ? 1 : 0.4 }} />
      })}
    </div>
  )
}

function Fader({ value, onChange, color = C.blue, tall = false }) {
  const trackRef = useRef(null)
  const height = tall ? 100 : 80
  const onDrag = (e) => {
    e.preventDefault()
    function move(ev) {
      const rect = trackRef.current.getBoundingClientRect()
      const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
      onChange(Math.round(pct * 100))
    }
    move(e)
    function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return (
    <div ref={trackRef} onMouseDown={onDrag} style={{ width: 4, height, background: C.border, position: 'relative', cursor: 'ns-resize' }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${value}%`, background: `${color}55` }} />
      <div style={{ position: 'absolute', left: -6, bottom: `calc(${value}% - 4px)`, width: 16, height: 8, background: color }} />
    </div>
  )
}

function ChannelStrip({ label, sublabel, value, onChange, onReset, muted, onToggleMute, solo, onToggleSolo, level, analyserActive, color = C.blue }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 14px' }}>
      <span style={{ fontFamily: C.head, fontSize: 12, letterSpacing: 1, color: C.textSec }}>{label}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }} onDoubleClick={onReset}>
        <Fader value={value} onChange={onChange} color={color} />
        <VuBars level={level} muted={muted} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 13, color, fontWeight: 700 }}>{muted ? 'MUTE' : `${value}%`}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onToggleMute} style={{
          width: 22, height: 18, fontSize: 10, fontFamily: C.body, fontWeight: 700,
          background: muted ? C.red : 'transparent', color: muted ? C.whiteHot : C.mutedHi,
          border: `1px solid ${muted ? C.red : C.border}`, cursor: 'pointer' }}>M</button>
        {onToggleSolo && (
          <button onClick={onToggleSolo} style={{
            width: 22, height: 18, fontSize: 10, fontFamily: C.body, fontWeight: 700,
            background: solo ? C.blue : 'transparent', color: solo ? C.whiteHot : C.mutedHi,
            border: `1px solid ${solo ? C.blue : C.border}`, cursor: 'pointer' }}>S</button>
        )}
      </div>
      <span style={{ fontFamily: C.head, fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>{sublabel}</span>
    </div>
  )
}

function MixerBar({ stereo }) {
  const { volumes, muted, toggleMute, solo, toggleSolo, setVolume, linked, setLinked, presets, applyPreset, activeGame, isPlaying, musicAnalyser, activeSource } = stereo
  const musicLevel = useAnalyserLevel(musicAnalyser, activeSource === 'local' && isPlaying)
  const musicSimLevel = useSimulatedLevel(activeSource !== 'local' && isPlaying)
  const gameLevel = useSimulatedLevel(!!activeGame)
  const commsLevel = useSimulatedLevel(false) // no shared AnalyserNode across CommsView's independent peer <audio> elements — see CLAUDE.md's Phase 18 notes

  return (
    <div style={{ height: 120, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 4,
      background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
      <ChannelStrip label="MUSIC" sublabel={activeSource.toUpperCase()} value={volumes.music} onChange={v => setVolume('music', v)}
        onReset={() => setVolume('music', 100)} muted={muted.music} onToggleMute={() => toggleMute('music')}
        solo={solo} onToggleSolo={() => toggleSolo()} level={activeSource === 'local' ? musicLevel : musicSimLevel} color={C.blue} />
      <div style={{ width: 1, height: 70, background: C.border }} />
      <ChannelStrip label="GAME" sublabel={activeGame ? activeGame.toUpperCase() : '—'} value={volumes.game} onChange={v => setVolume('game', v)}
        onReset={() => setVolume('game', 100)} muted={muted.game} onToggleMute={() => toggleMute('game')}
        level={gameLevel} color={C.orange} />
      <div style={{ width: 1, height: 70, background: C.border }} />
      <ChannelStrip label="COMMS" sublabel="crew" value={volumes.comms} onChange={v => setVolume('comms', v)}
        onReset={() => setVolume('comms', 100)} muted={muted.comms} onToggleMute={() => toggleMute('comms')}
        level={commsLevel} color={C.green} />

      <div style={{ width: 1, height: 70, background: C.border, margin: '0 8px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 14px' }}>
        <span style={{ fontFamily: C.head, fontSize: 12, letterSpacing: 1, color: C.textSec }}>MASTER</span>
        <Fader value={volumes.master} onChange={v => setVolume('master', v)} color={C.whiteHot} tall />
        <span style={{ fontFamily: C.mono, fontSize: 13, color: C.whiteHot, fontWeight: 700 }}>{volumes.master}%</span>
        <button onClick={() => setLinked(l => !l)} style={{
          fontSize: 9, fontFamily: C.body, fontWeight: 700, padding: '2px 8px',
          background: linked ? `${C.blue}22` : 'transparent', color: linked ? C.blue : C.mutedHi,
          border: `1px solid ${linked ? C.blue : C.border}`, cursor: 'pointer' }}>LINK</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {presets.filter(p => p.builtin).map(p => (
            <Tooltip key={p.id} text={`Music ${p.volumes.music}% · Game ${p.volumes.game}% · Comms ${p.volumes.comms}%`}>
              <button onClick={() => applyPreset(p)} style={{
                fontFamily: C.body, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '5px 10px',
                background: 'transparent', color: C.mutedHi, border: `1px solid ${C.border}`, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.blue }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mutedHi }}>
                {p.name}
              </button>
            </Tooltip>
          ))}
        </div>
        {presets.filter(p => !p.builtin).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 220 }}>
            {presets.filter(p => !p.builtin).map(p => (
              <button key={p.id} onClick={() => applyPreset(p)} style={{
                fontFamily: C.body, fontSize: 10, padding: '4px 8px',
                background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function StereoView() {
  const stereo = useStereo()
  const [tab, setTab] = useState('library')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MixerBar stereo={stereo} />
      <NowPlayingBar stereo={stereo} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px 0' }}>
          <TabBar tabs={[
            { id: 'library', label: 'Library' },
            { id: 'queue', label: 'Queue' },
            { id: 'sources', label: 'Sources' },
            { id: 'settings', label: 'Settings' },
          ]} active={tab} onChange={setTab} />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'library' && <LibraryTab stereo={stereo} />}
          {tab === 'queue' && <QueueTab stereo={stereo} />}
          {tab === 'sources' && <SourcesTab stereo={stereo} />}
          {tab === 'settings' && <StereoSettingsTab stereo={stereo} />}
        </div>
      </div>
    </div>
  )
}
