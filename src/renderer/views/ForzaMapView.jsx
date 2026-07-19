import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { C, Card, Btn, Label, Toggle } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { useForza } from '../hooks/useForza'
import { worldToMap } from '../lib/forzaMapCalibration'

const api = window.api

const GAMES = ['fh6', 'fh5'] // FH6 priority per brief
const GAME_COLORS = { fh6: '#FF6600', fh5: '#00A651' }
const GAME_LABELS = { fh6: 'FH6', fh5: 'FH5' }
const GAME_PORT_HINT = { fh6: 5700, fh5: 5300 }

const STATUS_COLORS = { 'IN RACE': C.red, 'OPEN DRIVING': C.green, IDLE: C.muted, OFFLINE: C.border }
const STATUS_ORDER = { 'IN RACE': 0, 'OPEN DRIVING': 1, IDLE: 2, OFFLINE: 3 }

function deriveStatus(pos) {
  if (!pos) return 'OFFLINE'
  if (pos.isRacing) return 'IN RACE'
  if ((pos.speed ?? 0) < 5) return 'IDLE'
  return 'OPEN DRIVING'
}

// ── Position smoothing — 300ms lerp toward each target, not a snap, so the
// 500ms broadcast interval looks smooth on screen. Drives its own rAF loop
// and forces a re-render every frame; the SVG being interpolated is cheap
// (a handful of small shapes), same cost class as the existing telemetry
// widgets' own frequent-update components (G-Force Circle, Input Trace). ──
function usePositionSmoothing(targets) {
  const [, bump] = useState(0)
  const stateRef = useRef({})

  useEffect(() => {
    const now = performance.now()
    for (const [handle, t] of Object.entries(targets)) {
      if (t.px == null || t.py == null) continue
      const prev = stateRef.current[handle]
      if (!prev) {
        stateRef.current[handle] = { px: t.px, py: t.py, startPx: t.px, startPy: t.py, targetPx: t.px, targetPy: t.py, startTime: now }
      } else if (prev.targetPx !== t.px || prev.targetPy !== t.py) {
        stateRef.current[handle] = { ...prev, startPx: prev.px, startPy: prev.py, targetPx: t.px, targetPy: t.py, startTime: now }
      }
    }
    for (const handle of Object.keys(stateRef.current)) {
      if (!(handle in targets)) delete stateRef.current[handle]
    }
  }, [targets])

  useEffect(() => {
    const DURATION = 300
    let raf = requestAnimationFrame(function tick() {
      const now = performance.now()
      for (const s of Object.values(stateRef.current)) {
        const t = Math.min(1, (now - s.startTime) / DURATION)
        s.px = s.startPx + (s.targetPx - s.startPx) * t
        s.py = s.startPy + (s.targetPy - s.startPy) * t
      }
      bump(n => n + 1)
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const out = {}
  for (const [handle, s] of Object.entries(stateRef.current)) out[handle] = { px: s.px, py: s.py }
  return out
}

// ── Left panel ───────────────────────────────────────────────────────────
function SetupInstructions({ game }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', color: C.blue, fontSize: 11, cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
        {open ? '− Hide setup' : '+ Show setup'}
      </button>
      {open && (
        <div style={{ fontSize: 11, color: C.textSec, marginTop: 6, lineHeight: 1.7 }}>
          Settings → HUD and Gameplay → Data Out: <b>ON</b><br />
          Data Out IP: <code>127.0.0.1</code>, Port: <code>{GAME_PORT_HINT[game]}</code>
        </div>
      )}
    </div>
  )
}

function PlayerCard({ handle, pos, isYou, onLocate }) {
  const status = deriveStatus(pos)
  const color = pos?.color || (isYou ? C.blue : C.mutedHi)
  return (
    <Card style={{ padding: '10px 12px', borderLeft: `2px solid ${color}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: C.head, fontSize: 14, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{handle}</span>
          {isYou && (
            <span style={{ fontFamily: C.mono, fontSize: 8, color: C.blue, border: `1px solid ${C.blue}`, padding: '0 4px' }}>YOU</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontFamily: C.head, fontSize: 10, letterSpacing: 1, color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}`, padding: '1px 6px' }}>
            {status}
          </span>
          {status !== 'IDLE' && status !== 'OFFLINE' && pos?.speed != null && (
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{Math.round(pos.speed)} KMH</span>
          )}
          {pos?.game && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{GAME_LABELS[pos.game] || pos.game.toUpperCase()}</span>}
        </div>
      </div>
      {status !== 'OFFLINE' && (
        <Tooltip text="Pan the map to this player">
          <Btn size="xs" variant="ghost" onClick={onLocate}>Locate</Btn>
        </Tooltip>
      )}
    </Card>
  )
}

function LeftPanel({
  selectedGame, setSelectedGame, activeGame, myPosition, identity,
  rows, onLocate, followMe, setFollowMe, onShowAll, opacity, setOpacity, onReplaceMap,
}) {
  const receiving = activeGame === selectedGame
  const activeRaceCount = rows.filter(r => deriveStatus(r.pos) === 'IN RACE').length

  return (
    <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {GAMES.map(g => (
            <button key={g} onClick={() => setSelectedGame(g)}
              style={{ flex: 1, padding: '8px 0', background: selectedGame === g ? `${GAME_COLORS[g]}18` : 'transparent',
                border: `1px solid ${selectedGame === g ? GAME_COLORS[g] : C.border}`, cursor: 'pointer',
                fontFamily: C.head, fontSize: 14, letterSpacing: 1, color: selectedGame === g ? GAME_COLORS[g] : C.muted }}>
              {GAME_LABELS[g]}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: receiving ? C.green : C.orange, flexShrink: 0,
            boxShadow: receiving ? `0 0 6px ${C.green}` : 'none' }} />
          <span style={{ fontFamily: C.head, fontSize: 11, letterSpacing: 1, color: receiving ? C.green : C.orange }}>
            {receiving ? 'RECEIVING TELEMETRY' : `START ${GAME_LABELS[selectedGame]} — ENABLE DATA OUT`}
          </span>
        </div>
        {!receiving && <SetupInstructions game={selectedGame} />}
      </div>

      {activeRaceCount > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: C.head, fontSize: 13, letterSpacing: 1, color: C.red }}>🏁 {activeRaceCount} ACTIVE RACE{activeRaceCount !== 1 ? 'S' : ''}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '32px 12px', lineHeight: 1.6 }}>
            No crew members detected.<br />Make sure your friends have ShinRacer open and Forza running with Data Out enabled.
          </div>
        ) : (
          rows.map(r => (
            <PlayerCard key={r.handle} handle={r.isYou ? (identity?.handle || 'YOU') : r.handle} pos={r.pos} isYou={r.isYou} onLocate={() => onLocate(r)} />
          ))
        )}
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle label="Follow me" hint="Keep your position centered on the map" value={followMe} onChange={setFollowMe} />
        <Btn size="sm" variant="subtle" onClick={onShowAll}>Show all</Btn>
        <div>
          <Label muted>Map opacity</Label>
          <input type="range" min={0.3} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))}
            style={{ width: '100%', accentColor: C.blue }} />
        </div>
        <Tooltip text={`Copy your own ${GAME_LABELS[selectedGame]} map screenshot in as the background`}>
          <Btn size="sm" variant="ghost" onClick={() => onReplaceMap(selectedGame)}>Replace map image…</Btn>
        </Tooltip>
      </div>
    </div>
  )
}

// ── Right panel: the map ─────────────────────────────────────────────────
function DirectionMarker({ px, py, color, heading, size, statusColor, pulsing }) {
  const headingDeg = (heading || 0) * (180 / Math.PI)
  return (
    <g transform={`translate(${px},${py})`}>
      <circle r={size} fill="none" stroke={statusColor} strokeWidth={2} opacity={pulsing ? undefined : (statusColor === C.muted ? 0.5 : 1)}>
        {pulsing && (
          <animate attributeName="r" values={`${size};${size * 1.2};${size}`} dur="1.5s" repeatCount="indefinite" />
        )}
      </circle>
      <polygon points={`0,${-size * 0.65} ${size * 0.5},${size * 0.5} 0,${size * 0.25} ${-size * 0.5},${size * 0.5}`}
        fill={color} transform={`rotate(${headingDeg})`} />
    </g>
  )
}

function MapCanvas({ game, mapImage, isPlaceholder, opacity, rows, followMe, setFollowMe, showAllSignal, locateSignal, showToast }) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ width: 800, height: 800 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [origin, setOrigin] = useState('50% 50%')
  const draggingRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const prevRacing = useRef({})
  const [flashes, setFlashes] = useState({}) // handle -> true briefly
  // Real natural pixel size of the loaded map image — never assume it matches
  // the container's aspect ratio (a screenshot the user drops in almost
  // certainly won't). Probed with a detached Image() whose onload is wired
  // up BEFORE src is assigned, not the rendered <img>'s own onLoad prop —
  // these map images are base64 data: URIs, which decode fast enough that
  // the browser's load event can fire before React finishes attaching the
  // listener to that specific DOM node on first mount, silently leaving
  // imgNatural stuck at null forever (confirmed live: the rendered <img>
  // reported naturalWidth/naturalHeight correctly via a direct DOM check
  // moments after mount, while the onLoad-driven state never updated).
  const [imgNatural, setImgNatural] = useState(null)
  useEffect(() => {
    setImgNatural(null)
    if (!mapImage) return
    let cancelled = false
    const probe = new Image()
    probe.onload = () => { if (!cancelled) setImgNatural({ width: probe.naturalWidth, height: probe.naturalHeight }) }
    probe.src = mapImage
    return () => { cancelled = true }
  }, [mapImage])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width: Math.max(1, width), height: Math.max(1, height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Letterbox-fit the map image into the container (equivalent to
  // object-fit: contain, computed by hand) so the whole image is always
  // visible — never cropped the way object-fit: cover would crop it when
  // the image's aspect ratio doesn't match the container's. Falls back to a
  // centered square while the real image's dimensions haven't loaded yet
  // (true for the 2000x2000 placeholders, a reasonable guess for most real
  // full-map screenshots too).
  const mapRect = useMemo(() => {
    if (!mapImage) return { left: 0, top: 0, width: size.width, height: size.height }
    const nw = imgNatural?.width || 1, nh = imgNatural?.height || 1
    const scale = Math.min(size.width / nw, size.height / nh)
    const w = nw * scale, h = nh * scale
    return { left: (size.width - w) / 2, top: (size.height - h) / 2, width: w, height: h }
  }, [mapImage, imgNatural, size])

  // Project every row's world position to map pixels — against the map's
  // own fitted rect, not the raw container, so markers always land on the
  // same spot the (now fully visible, un-cropped) image actually renders at.
  const projected = useMemo(() => {
    return rows.map(r => {
      const { px, py } = worldToMap(r.pos?.x, r.pos?.z, game, mapRect.width, mapRect.height)
      return { ...r, px: px + mapRect.left, py: py + mapRect.top }
    })
  }, [rows, game, mapRect])

  const targets = useMemo(() => {
    const t = {}
    for (const r of projected) t[r.handle] = { px: r.px, py: r.py }
    return t
  }, [projected])
  const smoothed = usePositionSmoothing(targets)

  // Race start/finish detection + toast + brief ring-flash.
  useEffect(() => {
    for (const r of rows) {
      const was = prevRacing.current[r.handle]
      const now = !!r.pos?.isRacing
      if (was === undefined) { prevRacing.current[r.handle] = now; continue }
      if (!was && now) {
        showToast?.(`🏁 ${r.isYou ? 'You' : r.handle} just started a race in ${GAME_LABELS[game] || game}`, C.red)
        setFlashes(f => ({ ...f, [r.handle]: true }))
        setTimeout(() => setFlashes(f => { const n = { ...f }; delete n[r.handle]; return n }), 600)
      } else if (was && !now) {
        showToast?.(`${r.isYou ? 'You' : r.handle} finished their race`, C.green)
      }
      prevRacing.current[r.handle] = now
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => `${r.handle}:${r.pos?.isRacing}`).join(',')])

  const fitAll = useCallback(() => {
    if (!projected.length) { setZoom(1); setPan({ x: 0, y: 0 }); return }
    const xs = projected.map(r => r.px), ys = projected.map(r => r.py)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const spanX = Math.max(maxX - minX, 200), spanY = Math.max(maxY - minY, 200)
    const z = Math.max(0.3, Math.min(8, Math.min(size.width / (spanX * 1.4), size.height / (spanY * 1.4))))
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setZoom(z)
    setPan({ x: size.width / 2 - cx * z, y: size.height / 2 - cy * z })
    setOrigin('0% 0%')
  }, [projected, size])

  useEffect(() => { if (showAllSignal) { fitAll(); setFollowMe(false) } }, [showAllSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!locateSignal) return
    const r = projected.find(p => p.handle === locateSignal.handle)
    if (!r) return
    setOrigin('0% 0%')
    setZoom(z => Math.max(z, 2))
    setPan({ x: size.width / 2 - r.px * Math.max(zoom, 2), y: size.height / 2 - r.py * Math.max(zoom, 2) })
    setFollowMe(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateSignal])

  // Follow me: keep local player centered.
  useEffect(() => {
    if (!followMe) return
    const me = projected.find(r => r.isYou)
    if (!me) return
    setOrigin('0% 0%')
    setPan({ x: size.width / 2 - me.px * zoom, y: size.height / 2 - me.py * zoom })
  }, [followMe, projected, zoom, size])

  const onWheel = (e) => {
    e.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    setOrigin(`${e.clientX - rect.left}px ${e.clientY - rect.top}px`)
    setZoom(z => Math.max(0.3, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
  }
  const onMouseDown = (e) => {
    draggingRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }
  const onMouseMove = (e) => {
    if (!draggingRef.current) return
    if (followMe) setFollowMe(false)
    const d = draggingRef.current
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }
  const endDrag = () => { draggingRef.current = null }

  const empty = rows.length === 0

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: C.bg }}>
      <div ref={containerRef}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        style={{ position: 'absolute', inset: 0, cursor: draggingRef.current ? 'grabbing' : 'grab', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: size.width, height: size.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: origin,
          transition: draggingRef.current ? 'none' : 'transform 200ms ease',
        }}>
          {mapImage && (
            <img src={mapImage} alt="" draggable={false}
              style={{ position: 'absolute', left: mapRect.left, top: mapRect.top, width: mapRect.width, height: mapRect.height, opacity, pointerEvents: 'none' }} />
          )}
          <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0 }}>
            {projected.map(r => {
              const s = smoothed[r.handle] || { px: r.px, py: r.py }
              const status = deriveStatus(r.pos)
              const markerSize = r.isYou ? 20 : 14
              return (
                <g key={r.handle} onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
                  <DirectionMarker px={s.px} py={s.py} color={r.pos?.color || (r.isYou ? C.blue : C.mutedHi)}
                    heading={r.pos?.heading || 0} size={flashes[r.handle] ? markerSize * 2 : markerSize}
                    statusColor={STATUS_COLORS[status]} pulsing={status === 'IN RACE'} />
                  <text x={s.px} y={s.py - markerSize - 8} textAnchor="middle" fontSize="11" fontFamily={C.body}
                    fill={C.textPrimary} stroke={C.bg} strokeWidth={3} paintOrder="stroke">
                    {r.isYou ? 'YOU' : r.handle}
                  </text>
                  {r.pos?.speed > 10 && (
                    <text x={s.px} y={s.py + markerSize + 14} textAnchor="middle" fontSize="9" fontFamily={C.mono} fill={C.muted}>
                      {Math.round(r.pos.speed)} KM/H
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {isPlaceholder && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: `${C.orange}18`, borderBottom: `1px solid ${C.orange}60`,
          padding: '8px 16px', fontSize: 12, color: C.orange, textAlign: 'center' }}>
          Add your own map image at <code>resources/maps/{game}_map.jpg</code> for a real map background. Placeholder shown.
        </div>
      )}

      {empty && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
          <div style={{ fontFamily: C.head, fontSize: 48, letterSpacing: 2, color: GAME_COLORS[game] }}>{GAME_LABELS[game]}</div>
          <div style={{ fontFamily: C.body, fontSize: 14, color: C.muted }}>Waiting for Forza telemetry…</div>
        </div>
      )}

      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Btn size="xs" variant="subtle" onClick={() => setZoom(z => Math.min(8, +(z * 1.3).toFixed(2)))}>+</Btn>
        <Btn size="xs" variant="subtle" onClick={() => setZoom(z => Math.max(0.3, +(z / 1.3).toFixed(2)))}>−</Btn>
        <Btn size="xs" variant="subtle" onClick={fitAll}>Fit</Btn>
      </div>

      {selected && (
        <div style={{ position: 'absolute', bottom: 16, left: 16, background: C.raised, border: `1px solid ${C.border}`, padding: 14, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: C.head, fontSize: 15 }}>{selected.isYou ? 'YOU' : selected.handle}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: 12, color: STATUS_COLORS[deriveStatus(selected.pos)], marginBottom: 4 }}>{deriveStatus(selected.pos)}</div>
          {selected.pos?.speed != null && <div style={{ fontSize: 12, color: C.muted }}>{Math.round(selected.pos.speed)} km/h</div>}
          <div style={{ fontSize: 12, color: C.muted }}>{GAME_LABELS[selected.pos?.game] || selected.pos?.game}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {selected.pos?.ts ? `Last seen ${Math.max(0, Math.round((Date.now() - selected.pos.ts) / 1000))}s ago` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────
export default function ForzaMapView() {
  const { identity, showToast } = useStore()
  const { myPosition, players, activeGame } = useForza(identity)
  const [selectedGame, setSelectedGame] = useState('fh6')
  const [collapsed, setCollapsed] = useState(false)
  const [followMe, setFollowMe] = useState(true)
  const [opacity, setOpacity] = useState(0.7)
  const [mapImage, setMapImage] = useState(null)
  const [isPlaceholder, setIsPlaceholder] = useState(true)
  const [showAllSignal, setShowAllSignal] = useState(0)
  const [locateSignal, setLocateSignal] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.forzamap.getMapImage(selectedGame).then(res => {
      if (cancelled) return
      if (res.ok) { setMapImage(`data:${res.mimeType};base64,${res.base64}`); setIsPlaceholder(!!res.isPlaceholder) }
      else { setMapImage(null); setIsPlaceholder(true) }
    })
    return () => { cancelled = true }
  }, [selectedGame])

  const rows = useMemo(() => {
    const list = []
    if (myPosition && identity?.handle) {
      list.push({ handle: identity.handle, isYou: true, pos: { ...myPosition, color: identity.color } })
    } else if (activeGame == null) {
      list.push({ handle: identity?.handle || 'you', isYou: true, pos: null })
    }
    for (const [handle, pos] of Object.entries(players)) {
      if (pos.game !== selectedGame) continue
      list.push({ handle, isYou: false, pos })
    }
    // Only show "you" row when it matches the selected game (or you're offline, to still surface the OFFLINE state).
    const filtered = list.filter(r => r.isYou ? (r.pos == null || r.pos.game === selectedGame) : true)
    return filtered.sort((a, b) => {
      if (a.isYou !== b.isYou) return a.isYou ? -1 : 1
      return (STATUS_ORDER[deriveStatus(a.pos)] ?? 9) - (STATUS_ORDER[deriveStatus(b.pos)] ?? 9)
    })
  }, [myPosition, players, identity, selectedGame, activeGame])

  const replaceMap = async (game) => {
    const res = await api.forzamap.replaceMapImage(game)
    if (res.ok) {
      const img = await api.forzamap.getMapImage(game)
      if (img.ok) { setMapImage(`data:${img.mimeType};base64,${img.base64}`); setIsPlaceholder(!!img.isPlaceholder) }
      showToast?.(`✓ ${GAME_LABELS[game]} map updated`)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {!collapsed && (
        <LeftPanel
          selectedGame={selectedGame} setSelectedGame={setSelectedGame} activeGame={activeGame}
          myPosition={myPosition} identity={identity} rows={rows}
          onLocate={(r) => setLocateSignal({ handle: r.handle, t: Date.now() })}
          followMe={followMe} setFollowMe={setFollowMe}
          onShowAll={() => setShowAllSignal(s => s + 1)}
          opacity={opacity} setOpacity={setOpacity}
          onReplaceMap={replaceMap}
        />
      )}
      <button onClick={() => setCollapsed(c => !c)}
        style={{ position: 'absolute', top: 12, left: collapsed ? 0 : 320, zIndex: 2, transform: 'translateX(0)',
          background: C.raised, border: `1px solid ${C.border}`, color: C.textSec, cursor: 'pointer',
          width: 20, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {collapsed ? '▶' : '◀'}
      </button>
      <MapCanvas
        game={selectedGame} mapImage={mapImage} isPlaceholder={isPlaceholder} opacity={opacity}
        rows={rows} followMe={followMe} setFollowMe={setFollowMe}
        showAllSignal={showAllSignal} locateSignal={locateSignal} showToast={showToast}
      />
    </div>
  )
}
