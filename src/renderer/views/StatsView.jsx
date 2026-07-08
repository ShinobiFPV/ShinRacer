import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Select } from '../components/primitives'
import { useStore } from '../store/AppStore'
import { useTelemetry } from '../hooks/useTelemetry'
import api from '../lib/api'

function fmtLapTime(ms) {
  if (ms == null) return '—'
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(3)
  return `${m}:${s.padStart(6, '0')}`
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
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.yellow, fontWeight: 700 }}>{fmtLapTime(b.lap_time_ms)}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.muted }}>{fmtLapTime(b.s1_ms)}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.muted }}>{fmtLapTime(b.s2_ms)}</td>
              <td style={{ padding: '6px 10px', fontFamily: C.mono, color: C.muted }}>{fmtLapTime(b.s3_ms)}</td>
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
          background: i === 0 ? `${C.yellow}12` : C.bg, border: `1px solid ${i === 0 ? C.yellowDim : C.border}`, borderRadius: 5 }}>
          <span style={{ fontFamily: C.mono, color: i === 0 ? C.yellow : C.muted, width: 20 }}>{i + 1}</span>
          <span style={{ flex: 1, fontFamily: C.head, fontWeight: 600 }}>{r.handle}</span>
          <span style={{ fontFamily: C.mono, color: C.mutedHi }}>{fmtLapTime(r.lap_time_ms)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Lap history chart (plain SVG) ─────────────────────────────────────────────
function LapChart({ laps }) {
  const W = 640, H = 200, PL = 50, PR = 10, PT = 10, PB = 24
  const iW = W - PL - PR, iH = H - PT - PB
  const colors = [C.yellow, C.blue, C.green, C.orange, C.purple, C.red]

  const byHandle = useMemo(() => {
    const map = {}
    laps.forEach(l => { (map[l.handle] ||= []).push(l) })
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.lap_number ?? 0) - (b.lap_number ?? 0)))
    return map
  }, [laps])

  if (!laps.length) return <div style={{ color: C.muted, fontSize: 12, padding: 20, textAlign: 'center' }}>No laps recorded for this session yet</div>

  const times = laps.map(l => l.lap_time_ms)
  const min = Math.min(...times), max = Math.max(...times)
  const range = Math.max(1, max - min)
  const maxLapNum = Math.max(1, ...laps.map((l, i) => l.lap_number || i + 1))

  const xFor = (n) => PL + ((n - 1) / Math.max(1, maxLapNum - 1)) * iW
  const yFor = (ms) => PT + (1 - (ms - min) / range) * iH
  const handles = Object.keys(byHandle)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g} x1={PL} x2={W - PR} y1={PT + g * iH} y2={PT + g * iH} stroke={C.border} strokeWidth={0.5} />
        ))}
        <text x={PL - 4} y={PT + 4} textAnchor="end" fontSize={8} fill={C.muted}>{(max / 1000).toFixed(1)}s</text>
        <text x={PL - 4} y={PT + iH} textAnchor="end" fontSize={8} fill={C.muted}>{(min / 1000).toFixed(1)}s</text>
        {handles.map((h, hi) => {
          const pts = byHandle[h]
          const d = pts.map((l, i) => `${i === 0 ? 'M' : 'L'} ${xFor(l.lap_number || i + 1)} ${yFor(l.lap_time_ms)}`).join(' ')
          return <path key={h} d={d} fill="none" stroke={colors[hi % colors.length]} strokeWidth={1.8} strokeLinejoin="round" />
        })}
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {handles.map((h, hi) => (
          <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.mutedHi }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[hi % colors.length] }} />
            {h}
          </div>
        ))}
      </div>
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
                    background: r.handle === selfHandle ? `${C.yellow}10` : C.bg, border: `1px solid ${C.border}`, borderRadius: 5 }}>
                    <span style={{ flex: 1, fontFamily: C.head, fontWeight: 600, color: r.handle === selfHandle ? C.yellow : C.white }}>{r.handle}</span>
                    <span style={{ fontFamily: C.mono }}>{fmtLapTime(r.best_ms)}</span>
                    {delta != null && (
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: delta < 0 ? C.green : C.red, minWidth: 64, textAlign: 'right' }}>
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

// ── Stats Root ─────────────────────────────────────────────────────────────────
export default function StatsView() {
  const { identity, showToast } = useStore()
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [sessionLaps, setSessionLaps] = useState([])
  const [bests, setBests] = useState([])
  const [leaderboard, setLeaderboard] = useState([])

  const [captureOn, setCaptureOn] = useState(false)
  const [liveTrack, setLiveTrack] = useState('')
  const [liveCar, setLiveCar] = useState('')
  const { laps: rawLaps, listening } = useTelemetry({ enabled: captureOn })
  const postedCountRef = useRef(0)

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
      for (const lap of newLaps) {
        try {
          await api.post('/api/stats/lap', {
            handle: identity.handle, track: liveTrack, car: liveCar, sessionId,
            lapTime: lap.lapTimeMs, sector1: lap.sector1Ms, sector2: lap.sector2Ms,
            ts: new Date(lap.ts).toISOString(),
          })
          showToast(`Lap recorded: ${fmtLapTime(lap.lapTimeMs)}`)
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

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
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
          <Btn variant={captureOn ? 'danger' : 'primary'} onClick={() => setCaptureOn(v => !v)} disabled={!liveTrack}>
            {captureOn ? (listening ? '■ Stop capture' : 'Starting…') : '● Start capture'}
          </Btn>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <Label muted>Session</Label>
          <Select value={selectedSessionId} onChange={setSelectedSessionId}
            options={[{ value: '', label: '— select a session —' }, ...filteredSessions.map(s => ({ value: s.id, label: `${s.track} · ${s.date}` }))]} />
        </div>
        <div style={{ width: 220 }}>
          <Label muted>Filter by track</Label>
          <TextInput value={trackFilter} onChange={setTrackFilter} placeholder="track name…" />
        </div>
      </div>

      <Card>
        <SectionHead children="Personal bests" sub={identity?.handle || 'Set your handle in Settings'} />
        <BestsTable bests={bests} />
      </Card>

      {selectedSessionId && (
        <Card>
          <SectionHead children="Session leaderboard" sub={sessions.find(s => s.id === selectedSessionId)?.track} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
            <SessionLeaderboard laps={sessionLaps} />
            <LapChart laps={sessionLaps} />
          </div>
        </Card>
      )}

      <Card>
        <SectionHead children="Friends comparison" sub="Best laps per track, relative to you" />
        <FriendsComparison leaderboard={leaderboard} selfHandle={identity?.handle} />
      </Card>
    </div>
  )
}
