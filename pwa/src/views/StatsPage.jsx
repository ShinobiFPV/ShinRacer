import { useEffect, useMemo, useState } from 'react'
import { C } from '../lib/colors'
import { Card, Chip, PageTitle, EmptyState } from '../components/primitives'
import api from '../lib/api'
import { formatLapTime } from '../lib/format'
import { getIdentity } from '../lib/auth'

function LapChart({ laps }) {
  if (laps.length === 0) return null
  const w = Math.max(laps.length * 28, 300)
  const h = 100
  const max = Math.max(...laps.map(l => l.lap_time_ms))
  const min = Math.min(...laps.map(l => l.lap_time_ms))
  const range = Math.max(max - min, 1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h + 20}>
        {laps.map((l, i) => {
          const barH = 8 + ((l.lap_time_ms - min) / range) * (h - 8)
          const isBest = l.lap_time_ms === min
          return (
            <g key={l.id}>
              <rect x={i * 28 + 6} y={h - barH} width={16} height={barH} fill={isBest ? C.yellow : C.blue} />
              <text x={i * 28 + 14} y={h + 14} fontSize={9} fill={C.muted} textAnchor="middle">{l.lap_number ?? i + 1}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function StatsPage() {
  const identity = getIdentity()
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [trackFilter, setTrackFilter] = useState('all')
  const [bests, setBests] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [expandedTrack, setExpandedTrack] = useState(null)
  const [trackLaps, setTrackLaps] = useState([])
  const [sessionLaps, setSessionLaps] = useState([])

  useEffect(() => {
    api.get('/api/stats/sessions').then(({ data }) => { if (data.ok) setSessions(data.data) })
    api.get('/api/stats/leaderboard').then(({ data }) => { if (data.ok) setLeaderboard(data.data) })
  }, [])

  useEffect(() => {
    api.get('/api/stats/bests', { params: { handle: identity?.handle || undefined } })
      .then(({ data }) => { if (data.ok) setBests(data.data) })
  }, [identity?.handle])

  useEffect(() => {
    if (!sessionId) { setSessionLaps([]); return }
    api.get('/api/stats/laps', { params: { sessionId } }).then(({ data }) => { if (data.ok) setSessionLaps(data.data) })
  }, [sessionId])

  const tracks = useMemo(() => [...new Set(sessions.map(s => s.track))], [sessions])
  const bestsByTrack = useMemo(() => {
    const grouped = {}
    bests.forEach(b => {
      if (!grouped[b.track] || b.lap_time_ms < grouped[b.track].lap_time_ms) grouped[b.track] = b
    })
    return Object.values(grouped).filter(b => trackFilter === 'all' || b.track === trackFilter)
  }, [bests, trackFilter])

  const leaderboardByTrack = useMemo(() => {
    const grouped = {}
    leaderboard.forEach(row => { (grouped[row.track] ||= []).push(row) })
    return grouped
  }, [leaderboard])

  async function expandTrack(track) {
    if (expandedTrack === track) { setExpandedTrack(null); return }
    setExpandedTrack(track)
    const { data } = await api.get('/api/stats/laps', { params: { handle: identity?.handle, track } })
    if (data.ok) setTrackLaps(data.data)
  }

  const noLapsAtAll = sessions.length === 0

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 32, padding: '0 16px' }}>
      <PageTitle style={{ padding: '16px 0 12px' }}>Stats</PageTitle>

      {noLapsAtAll ? (
        <EmptyState emoji="⏱️" title="No laps yet"
          subtitle="Lap stats are recorded by the ShinRacer desktop app when AC is running. Check back after your next session." />
      ) : (
        <>
          <select value={sessionId} onChange={e => setSessionId(e.target.value)}
            style={{ width: '100%', minHeight: 44, background: C.raised, border: `1px solid ${C.border}`, color: C.textPrimary, fontFamily: C.body, fontSize: 14, marginBottom: 12 }}>
            <option value="">Select a session…</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.track} — {s.created_at ? new Date(s.created_at).toLocaleString() : s.date}</option>)}
          </select>

          {sessionLaps.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Lap history</div>
              <LapChart laps={sessionLaps} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
            <Chip active={trackFilter === 'all'} onClick={() => setTrackFilter('all')}>All tracks</Chip>
            {tracks.map(t => <Chip key={t} active={trackFilter === t} onClick={() => setTrackFilter(t)}>{t}</Chip>)}
          </div>

          <div style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, marginBottom: 8 }}>Personal bests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
            {bestsByTrack.length === 0 && <EmptyState emoji="🏁" title="No data yet" />}
            {bestsByTrack.map(b => (
              <Card key={b.track + b.car} onClick={() => expandTrack(b.track)}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14 }}>{b.track}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 14, color: C.yellow }}>{formatLapTime(b.lap_time_ms)}</div>
                </div>
                {expandedTrack === b.track && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                    {trackLaps.map(l => (
                      <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: C.mono, fontSize: 12, color: C.textSec, padding: '2px 0' }}>
                        <span>Lap {l.lap_number ?? '—'}</span>
                        <span>{formatLapTime(l.lap_time_ms)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, marginBottom: 8 }}>Friends comparison</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.keys(leaderboardByTrack).length === 0 && <EmptyState emoji="👥" title="NO DATA YET" />}
            {Object.entries(leaderboardByTrack)
              .filter(([track]) => trackFilter === 'all' || track === trackFilter)
              .map(([track, rows]) => {
                const mine = rows.find(r => r.handle === identity?.handle)
                const others = rows.filter(r => r.handle !== identity?.handle)
                return (
                  <Card key={track}>
                    <div style={{ fontFamily: C.head, fontSize: 14, marginBottom: 8 }}>{track}</div>
                    {others.map(r => {
                      const delta = mine ? r.best_ms - mine.best_ms : null
                      return (
                        <div key={r.handle} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                          <span>{r.handle}</span>
                          <span style={{ fontFamily: C.mono }}>
                            {formatLapTime(r.best_ms)}
                            {delta != null && (
                              <span style={{ color: delta < 0 ? C.red : C.green, marginLeft: 8 }}>
                                {delta < 0 ? '−' : '+'}{formatLapTime(Math.abs(delta))}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </Card>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
