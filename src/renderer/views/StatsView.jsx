import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Select, Tag, Toggle, OfflineBanner } from '../components/primitives'
import Tooltip, { useTooltip } from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { useTelemetry } from '../hooks/useTelemetry'
import { formatLapTime } from '../lib/format'
import api from '../lib/api'

const TELEMETRY_SNIPPET = '[LIVE_TELEMETRY]\nENABLE=1\nAPP_ID=race_stats\nUDP_PORT=9996'

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportCsv(laps) {
  const header = 'Session,Track,Car,Driver,Lap,Time,S1,S2,S3,Valid'
  const rows = laps.map(l => [
    l.session_id, l.track, l.car, l.handle, l.lap_number ?? '', l.lap_time_ms,
    l.s1_ms ?? '', l.s2_ms ?? '', l.s3_ms ?? '', l.valid ? 1 : 0,
  ].join(','))
  downloadBlob([header, ...rows].join('\n'), 'text/csv', `session-${laps[0]?.session_id || 'export'}.csv`)
}

function exportJson(session, laps) {
  downloadBlob(JSON.stringify({ session, laps }, null, 2), 'application/json', `session-${session?.id || 'export'}.json`)
}

const sessionLabel = (s) => {
  const hhmm = s.created_at ? new Date(s.created_at).toTimeString().slice(0, 5) : ''
  return hhmm ? `${s.track} — ${hhmm}` : `${s.track} · ${s.date}`
}

// ── Personal bests table ──────────────────────────────────────────────────────
function BestsTable({ bests }) {
  if (!bests.length) return <div style={{ color: C.muted, fontSize: 12, padding: 12 }}>No lap times recorded yet</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: C.muted, fontFamily: C.head, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <th style={{ padding: '6px 10px' }}>Track</th>
            <th style={{ padding: '6px 10px' }}>Car</th>
            <th style={{ padding: '6px 10px' }}>Best lap</th>
            <th style={{ padding: '6px 10px' }}>S1</th>
            <th style={{ padding: '6px 10px' }}>S2</th>
            <th style={{ padding: '6px 10px' }}>S3</th>
            <th style={{ padding: '6px 10px' }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {bests.map((b, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: '6px 10px', fontFamily: C.mono }}>{b.track}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.mutedHi }}>{b.car}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.blue, fontWeight: 700 }}>{formatLapTime(b.lap_time_ms)}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.muted }}>{formatLapTime(b.s1_ms)}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.muted }}>{formatLapTime(b.s2_ms)}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.muted }}>{formatLapTime(b.s3_ms)}</td>
              <td style={{ padding: '6px 10px', color: C.muted }}>{b.ts?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Session leaderboard ────────────────────────────────────────────────────────
function SessionLeaderboard({ laps }) {
  const rows = useMemo(() => {
    const byHandle = {}
    laps.forEach(l => {
      if (!byHandle[l.handle] || l.lap_time_ms < byHandle[l.handle].lap_time_ms) byHandle[l.handle] = l
    })
    return Object.values(byHandle).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
  }, [laps])

  if (!rows.length) return <div style={{ color: C.muted, fontSize: 12 }}>No laps yet</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r, i) => (
        <div key={r.handle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
          background: i === 0 ? `${C.yellow}12` : C.bg, border: `1px solid ${i === 0 ? `${C.yellow}80` : C.border}`, borderRadius: 8 }}>
          <span style={{ fontFamily: C.mono, color: i === 0 ? C.yellow : C.muted, width: 20 }}>{i + 1}</span>
          <span style={{ flex: 1, fontFamily: C.head, fontWeight: 600 }}>{r.handle}</span>
          <span style={{ fontFamily: C.mono, color: C.mutedHi }}>{formatLapTime(r.lap_time_ms)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Sector delta stacked bar chart ─────────────────────────────────────────────
// Bar height is each lap's total time relative to the slowest lap in the session
// (so every bar fits the chart); a dashed line marks the session's personal best.
function SectorBarChart({ laps }) {
  const W = 640, H = 220, PL = 50, PR = 10, PT = 10, PB = 34
  const iW = W - PL - PR, iH = H - PT - PB
  const [hover, setHover] = useState(null)
  const { showTooltip, hideTooltip } = useTooltip()
  const palette = [C.mutedHi, '#8E44AD', '#00BCD4', '#FF80AB']

  if (!laps.length) return <div style={{ color: C.muted, fontSize: 12, padding: 20, textAlign: 'center' }}>No laps recorded for this session yet</div>

  const ordered = [...laps].sort((a, b) => (a.ts || '').localeCompare(b.ts || '') || (a.lap_number ?? 0) - (b.lap_number ?? 0))
  const bestTotal = Math.min(...ordered.map(l => l.lap_time_ms))
  const maxTotal = Math.max(...ordered.map(l => l.lap_time_ms))
  const slotW = iW / ordered.length
  const barW = Math.min(28, slotW - 4)

  const handles = [...new Set(ordered.map(l => l.handle))]
  const driverColors = {}
  handles.forEach((h, i) => { driverColors[h] = palette[i % palette.length] })

  const yFor = (val) => (val / maxTotal) * iH
  const xFor = (i) => PL + i * slotW + (slotW - barW) / 2
  const pbY = PT + iH - yFor(bestTotal)

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
        <line x1={PL} x2={W - PR} y1={pbY} y2={pbY} stroke={C.yellow} strokeWidth={1} strokeDasharray="4 3"
          style={{ cursor: 'default' }}
          onMouseEnter={e => showTooltip('Your personal best lap time for this session', e.target.getBoundingClientRect(), 'top')}
          onMouseLeave={hideTooltip} />
        <text x={W - PR} y={pbY - 4} textAnchor="end" fontSize={9} fill={C.yellow}
          onMouseEnter={e => showTooltip('Your personal best lap time for this session', e.target.getBoundingClientRect(), 'top')}
          onMouseLeave={hideTooltip}>PB: {formatLapTime(bestTotal)}</text>
        {ordered.map((l, i) => {
          const x = xFor(i)
          const s1h = yFor(l.s1_ms || 0), s2h = yFor(l.s2_ms || 0), s3h = yFor(l.s3_ms || 0)
          const baseY = PT + iH
          return (
            <g key={l.id} onMouseEnter={() => setHover(l)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <rect x={x - 1} y={baseY - s1h - s2h - s3h - 3} width={barW + 2} height={2} fill={driverColors[l.handle]} />
              <rect x={x} y={baseY - s3h} width={barW} height={s3h} fill={C.muted} />
              <rect x={x} y={baseY - s3h - s2h} width={barW} height={s2h} fill={C.textSec} />
              <rect x={x} y={baseY - s3h - s2h - s1h} width={barW} height={s1h} fill={C.blue} />
            </g>
          )
        })}
      </svg>
      {hover && (
        <div style={{ position: 'absolute', top: 4, right: 4, background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 12px', fontSize: 11, fontFamily: C.mono, color: C.mutedHi, pointerEvents: 'none' }}>
          <div style={{ color: C.textPrimary, fontWeight: 700, marginBottom: 4 }}>{hover.handle} · Lap {hover.lap_number ?? '—'}</div>
          <div><span style={{ color: C.blue }}>S1</span> {formatLapTime(hover.s1_ms)}</div>
          <div><span style={{ color: C.textSec }}>S2</span> {formatLapTime(hover.s2_ms)}</div>
          <div><span style={{ color: C.muted }}>S3</span> {formatLapTime(hover.s3_ms)}</div>
          <div style={{ marginTop: 3, color: C.textPrimary }}>Total {formatLapTime(hover.lap_time_ms)}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: C.mutedHi }}>
        {handles.map(h => (
          <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: driverColors[h] }} />
            {h}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Raw lap list (invalid laps shown struck-through in red) ───────────────────
function LapList({ laps }) {
  if (!laps.length) return <div style={{ color: C.muted, fontSize: 12 }}>No laps</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
      {laps.map(l => (
        <div key={l.id} style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: C.mono, padding: '2px 6px',
          color: l.valid ? C.mutedHi : C.red, textDecoration: l.valid ? 'none' : 'line-through' }}>
          <span style={{ width: 34 }}>#{l.lap_number ?? '—'}</span>
          <span style={{ flex: 1 }}>{l.handle}</span>
          <span>{formatLapTime(l.lap_time_ms)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Friends comparison ─────────────────────────────────────────────────────────
function FriendsComparison({ leaderboard, selfHandle }) {
  const byTrack = useMemo(() => {
    const map = {}
    leaderboard.forEach(r => { (map[r.track] ||= []).push(r) })
    Object.values(map).forEach(arr => arr.sort((a, b) => a.best_ms - b.best_ms))
    return map
  }, [leaderboard])

  const tracks = Object.keys(byTrack)
  if (!tracks.length) return <div style={{ color: C.muted, fontSize: 12 }}>No data yet</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {tracks.map(track => {
        const rows = byTrack[track]
        const self = rows.find(r => r.handle === selfHandle)
        return (
          <div key={track}>
            <Label muted>{track}</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.map(r => {
                const delta = self && r.handle !== selfHandle ? r.best_ms - self.best_ms : null
                return (
                  <div key={r.handle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px',
                    background: r.handle === selfHandle ? `${C.blue}10` : C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <span style={{ flex: 1, fontFamily: C.head, color: r.handle === selfHandle ? C.blue : C.textPrimary }}>{r.handle}</span>
                    <span style={{ fontFamily: C.mono }}>{formatLapTime(r.best_ms)}</span>
                    {delta != null && (
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: delta < 0 ? C.blue : C.red, minWidth: 64, textAlign: 'right' }}>
                        {delta < 0 ? '−' : '+'}{(Math.abs(delta) / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Empty state: no laps recorded anywhere yet ────────────────────────────────
function TelemetrySnippet() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, cursor: 'pointer', fontFamily: C.mono }}>
        {open ? '▾' : '▸'} Enable AC telemetry
      </button>
      {open && (
        <div style={{ marginTop: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, textAlign: 'left' }}>
          <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 11, color: C.mutedHi, whiteSpace: 'pre-wrap' }}>{TELEMETRY_SNIPPET}</pre>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(TELEMETRY_SNIPPET)}>Copy snippet</Btn>
            <span style={{ fontSize: 11, color: C.muted }}>Add to cfg/cfg.ini in your AC server folder</span>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyLapsState() {
  return (
    <Card style={{ padding: '50px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏱️</div>
      <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>No laps yet</div>
      <div style={{ fontFamily: C.body, color: C.muted, fontSize: 13, marginBottom: 16 }}>Turn on live capture above once AC is broadcasting telemetry.</div>
      <TelemetrySnippet />
    </Card>
  )
}

// ── Stats Root ─────────────────────────────────────────────────────────────────
export default function StatsView() {
  const { identity, showToast, backendUrl, backendOnline, recheckBackend } = useStore()
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [sessionLaps, setSessionLaps] = useState([])
  const [bests, setBests] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [includeInvalid, setIncludeInvalid] = useState(false)

  const [captureOn, setCaptureOn] = useState(false)
  const [liveTrack, setLiveTrack] = useState('')
  const [liveCar, setLiveCar] = useState('')
  const { laps: rawLaps, listening } = useTelemetry({ enabled: captureOn })
  const postedCountRef = useRef(0)
  const sessionInitRef = useRef(new Set())

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get('/api/stats/sessions')
      if (res.data.ok) setSessions(res.data.data)
    } catch (e) { /* backend unreachable — surfaced elsewhere */ }
  }, [])

  const loadBests = useCallback(async () => {
    if (!identity?.handle) return
    try {
      const res = await api.get('/api/stats/bests', { params: { handle: identity.handle } })
      if (res.data.ok) setBests(res.data.data)
    } catch (e) { /* backend unreachable */ }
  }, [identity?.handle])

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await api.get('/api/stats/leaderboard')
      if (res.data.ok) setLeaderboard(res.data.data)
    } catch (e) { /* backend unreachable */ }
  }, [])

  useEffect(() => { loadSessions(); loadBests(); loadLeaderboard() }, [loadSessions, loadBests, loadLeaderboard])

  useEffect(() => {
    if (!selectedSessionId) { setSessionLaps([]); return }
    ;(async () => {
      try {
        const res = await api.get('/api/stats/laps', { params: { sessionId: selectedSessionId } })
        if (res.data.ok) setSessionLaps(res.data.data)
      } catch (e) { /* backend unreachable */ }
    })()
  }, [selectedSessionId])

  // Post newly captured UDP laps to the backend as they arrive
  useEffect(() => {
    if (!captureOn || !liveTrack || !identity?.handle) return
    const newLaps = rawLaps.slice(postedCountRef.current)
    if (!newLaps.length) return
    postedCountRef.current = rawLaps.length
    const sessionId = `live_${new Date().toISOString().slice(0, 10)}_${liveTrack}`

    ;(async () => {
      if (!sessionInitRef.current.has(sessionId)) {
        sessionInitRef.current.add(sessionId)
        try {
          await api.post('/api/stats/session', {
            id: sessionId, track: liveTrack, date: new Date().toISOString().slice(0, 10), participants: [identity.handle],
          })
        } catch (e) { /* falls back to auto-create in /lap */ }
      }
      for (const lap of newLaps) {
        try {
          await api.post('/api/stats/lap', {
            handle: identity.handle, track: liveTrack, car: liveCar, sessionId,
            lapTime: lap.lapTimeMs, sector1: lap.s1, sector2: lap.s2, sector3: lap.s3,
            valid: lap.valid, ts: new Date(lap.ts).toISOString(),
          })
          showToast(`Lap recorded: ${formatLapTime(lap.lapTimeMs)}${lap.valid === false ? ' (invalid)' : ''}`)
        } catch (e) {
          showToast(`✕ Failed to record lap: ${e.message}`, C.red)
        }
      }
      loadSessions(); loadBests(); loadLeaderboard()
      if (selectedSessionId === sessionId) {
        const res = await api.get('/api/stats/laps', { params: { sessionId } })
        if (res.data.ok) setSessionLaps(res.data.data)
      }
    })()
  }, [rawLaps, captureOn, liveTrack, liveCar, identity?.handle, selectedSessionId, loadSessions, loadBests, loadLeaderboard, showToast])

  const filteredSessions = trackFilter
    ? sessions.filter(s => s.track.toLowerCase().includes(trackFilter.toLowerCase()))
    : sessions

  const visibleSessionLaps = includeInvalid ? sessionLaps : sessionLaps.filter(l => l.valid)
  const noDataAtAll = sessions.length === 0 && bests.length === 0
  const selectedSession = sessions.find(s => s.id === selectedSessionId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {!backendOnline && <OfflineBanner backendUrl={backendUrl} onRetry={recheckBackend} />}
      <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Card>
          <SectionHead children="Live telemetry capture" sub="Enable [LIVE_TELEMETRY] ENABLE=1 in AC's cfg.ini — broadcasts on UDP 9996" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <Label muted>Track</Label>
              <TextInput value={liveTrack} onChange={setLiveTrack} placeholder="ks_nordschleife" mono />
            </div>
            <div>
              <Label muted>Car</Label>
              <TextInput value={liveCar} onChange={setLiveCar} placeholder="ks_toyota_ae86" mono />
            </div>
            <Tooltip text={captureOn ? 'Close the telemetry port' : 'Open UDP port 9996 to capture lap times from AC'} disabled={!liveTrack}>
              <Btn variant={captureOn ? 'danger' : 'primary'} onClick={() => setCaptureOn(v => !v)} disabled={!liveTrack}>
                {captureOn ? (listening ? '■ Stop capture' : 'Starting…') : '● Start capture'}
              </Btn>
            </Tooltip>
          </div>
        </Card>

        <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <Label muted>Session</Label>
            <Tooltip text="Switch between recorded sessions">
              <Select value={selectedSessionId} onChange={setSelectedSessionId}
                options={[{ value: '', label: '— select a session —' }, ...filteredSessions.map(s => ({ value: s.id, label: sessionLabel(s) }))]} />
            </Tooltip>
          </div>
          <div style={{ width: 220 }}>
            <Label muted>Filter by track</Label>
            <TextInput value={trackFilter} onChange={setTrackFilter} placeholder="track name…" />
          </div>
          {captureOn && listening && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, animation: 'pulse 1s infinite' }} />
              <span style={{ fontFamily: C.head, fontSize: 15, letterSpacing: 1, color: C.red }}>REC</span>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{rawLaps.length} lap{rawLaps.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {noDataAtAll ? (
          <EmptyLapsState />
        ) : (
          <>
            <Card>
              <SectionHead children="Personal bests" sub={identity?.handle || 'Set your handle in Settings'} />
              <BestsTable bests={bests} />
            </Card>

            {selectedSessionId && (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <SectionHead children="Session leaderboard" sub={selectedSession ? sessionLabel(selectedSession) : ''} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Tooltip text="Download lap data as a spreadsheet-compatible CSV file" disabled={!visibleSessionLaps.length}>
                      <Btn size="xs" variant="subtle" onClick={() => exportCsv(visibleSessionLaps)} disabled={!visibleSessionLaps.length}>Export CSV</Btn>
                    </Tooltip>
                    <Tooltip text="Download complete session data as JSON" disabled={!visibleSessionLaps.length}>
                      <Btn size="xs" variant="subtle" onClick={() => exportJson(selectedSession, visibleSessionLaps)} disabled={!visibleSessionLaps.length}>Export JSON</Btn>
                    </Tooltip>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 16 }}>
                  <SessionLeaderboard laps={visibleSessionLaps} />
                  <SectorBarChart laps={visibleSessionLaps} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Label muted>All laps</Label>
                  <Tooltip text="Show laps where you cut the track (marked red)">
                    <Toggle label="Include invalid laps" value={includeInvalid} onChange={setIncludeInvalid} />
                  </Tooltip>
                </div>
                <LapList laps={visibleSessionLaps} />
              </Card>
            )}

            <Card>
              <Tooltip text="Compare your best lap against each friend's best on this track" position="bottom">
                <div><SectionHead children="Friends comparison" sub="Best laps per track, relative to you" /></div>
              </Tooltip>
              <FriendsComparison leaderboard={leaderboard} selfHandle={identity?.handle} />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
