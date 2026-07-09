import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { C, Tag, Btn, StatusDot, Label, TextInput } from '../components/primitives'
import { useStore } from '../store/AppStore'
import { useSocket } from '../hooks/useSocket'
import httpApi from '../lib/api'

const api = window.api

// ── Log Panel ─────────────────────────────────────────────────────────────────
function LogPanel({ server, onClose }) {
  const [lines, setLines]   = useState([])
  const [filter, setFilter] = useState('')
  const bottomRef           = useRef(null)

  useEffect(() => {
    // Load existing log
    if (server.logPath) {
      api.server.readLog(server.logPath, 300).then(text => {
        if (text) setLines(text.split('\n').filter(Boolean))
      })
    }
    // Stream new lines
    const unsub = api.server.onLog(server.id, line => {
      setLines(prev => [...prev.slice(-500), line])
    })
    return unsub
  }, [server.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const filtered = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines

  const colorFor = (line) => {
    if (line.includes('[ERR]') || line.includes('ERROR')) return C.red
    if (line.includes('connected')) return C.green
    if (line.includes('disconnected') || line.includes('kick')) return C.orange
    if (line.includes('collision') || line.includes('WARN')) return C.orange
    return C.mutedHi
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 760, height: 560, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', gap: 10, alignItems: 'center' }}>
          <StatusDot online />
          <span style={{ fontFamily: C.head, fontWeight: 700, fontSize: 15 }}>{server.name}</span>
          <Tag color={C.green}>LIVE LOG</Tag>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…"
            style={{ marginLeft: 'auto', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.white, padding: '4px 10px', fontSize: 11, fontFamily: C.mono, outline: 'none', width: 160 }} />
          <Btn variant="ghost" size="sm" onClick={onClose}>✕ Close</Btn>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', fontFamily: C.mono,
          fontSize: 11, lineHeight: 1.8, background: C.bg }}>
          {filtered.map((l, i) => (
            <div key={i} style={{ color: colorFor(l) }}>{l}</div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`,
          fontSize: 10, color: C.muted, fontFamily: C.mono }}>
          {lines.length} lines · PID {server.pid} · {server.logPath}
        </div>
      </div>
    </div>
  )
}

// ── Share / Invite modal ─────────────────────────────────────────────────────
// Exported so EventsView can reuse it for "Generate invite" against a live
// server matching an event's track, instead of duplicating the invite UI.
export function ShareModal({ server, identity, carRestriction, onClose, showToast }) {
  const [invite, setInvite] = useState(null) // { code, url, expiresAt, host, port, password, track }
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    (async () => {
      const localIp = await api.network.getLocalIp()
      const host = localIp || 'YOUR-HOST'
      const password = server.config?.password || ''
      const track = server.config?.trackId || ''
      try {
        const res = await httpApi.post('/api/invites', {
          serverName: server.name, host, port: server.config?.port,
          password, track, cars: server.config?.cars || [],
          expiresIn: 3600, created_by: identity?.handle || '',
        })
        if (res.data.ok) setInvite({ ...res.data.data, host, port: server.config?.port, password, track })
        else setError(res.data.error)
      } catch (e) {
        setError(e.message)
      }
    })()
  }, [server, identity])

  const qrDataUrl = useMemo(() => {
    if (!invite) return null
    const qr = qrcode(0, 'M')
    qr.addData(invite.url)
    qr.make()
    return qr.createDataURL(5, 2)
  }, [invite])

  const secondsLeft = invite ? Math.max(0, Math.round((new Date(invite.expiresAt).getTime() - now) / 1000)) : 0
  const minutesLeft = Math.floor(secondsLeft / 60)
  const joinCommand = invite ? `/connect ${invite.host}:${invite.port} password:${invite.password}` : ''

  const copy = (text, label) => {
    navigator.clipboard.writeText(text)
    showToast(`✓ Copied ${label}`)
  }

  const revoke = async () => {
    if (invite) {
      try { await httpApi.delete(`/api/invites/${invite.code}`) } catch (e) { /* closing anyway */ }
    }
    showToast('Invite revoked')
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 24, animation: 'fadeUp .18s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 17 }}>Invite to {server.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>✕ {error}</div>}
        {!invite && !error && <div style={{ color: C.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Generating invite…</div>}

        {invite && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: 32, fontWeight: 700, color: C.yellow, letterSpacing: 3 }}>{invite.code}</div>
            </div>

            {qrDataUrl && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <img src={qrDataUrl} alt="Invite QR code" style={{ borderRadius: 6, background: '#fff', padding: 8 }} />
              </div>
            )}

            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px',
              marginBottom: 16, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><span style={{ color: C.muted }}>Host: </span><span style={{ fontFamily: C.mono }}>{invite.host}:{invite.port}</span></div>
              {invite.password && <div><span style={{ color: C.muted }}>Password: </span><span style={{ fontFamily: C.mono }}>{invite.password}</span></div>}
              {invite.track && <div><span style={{ color: C.muted }}>Track: </span><span style={{ fontFamily: C.mono }}>{invite.track}</span></div>}
              {carRestriction && <div><span style={{ color: C.muted }}>Class: </span>{carRestriction}</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <Btn variant="subtle" size="sm" style={{ flex: 1 }} onClick={() => copy(invite.code, 'code')}>Copy code</Btn>
              <Btn variant="subtle" size="sm" style={{ flex: 1 }} onClick={() => copy(joinCommand, 'join command')}>Copy join command</Btn>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: secondsLeft < 300 ? C.orange : C.muted }}>
                {secondsLeft > 0 ? `Expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}` : 'Expired'}
              </div>
              <Btn variant="danger" size="xs" onClick={revoke}>Revoke</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Join-via-code modal ──────────────────────────────────────────────────────
function JoinModal({ onClose, showToast, prefillCode }) {
  const [code, setCode] = useState(prefillCode || '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lookup = useCallback(async (override) => {
    const trimmed = (override ?? code).trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await httpApi.get(`/api/invites/${trimmed}`)
      if (res.data.ok) setResult(res.data.data)
      else setError(res.data.error)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
    setLoading(false)
  }, [code])

  useEffect(() => {
    if (prefillCode) { setCode(prefillCode); lookup(prefillCode) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCode])

  const connect = () => {
    if (result) api.shell.openExternal(`accomp://${result.host}:${result.port}`)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 24, animation: 'fadeUp .18s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 17 }}>Join server</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <Label>Invite code</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <TextInput value={code} onChange={v => setCode(v.toUpperCase())} placeholder="SH4DW9" mono
            onKeyDown={e => { if (e.key === 'Enter') lookup() }} />
          <Btn size="sm" onClick={() => lookup()} disabled={loading}>{loading ? '…' : 'Join'}</Btn>
        </div>

        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>✕ {error}</div>}

        {result && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px',
            marginBottom: 14, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{result.serverName || 'AC Server'}</div>
            <div><span style={{ color: C.muted }}>Host: </span><span style={{ fontFamily: C.mono }}>{result.host}:{result.port}</span></div>
            {result.track && <div><span style={{ color: C.muted }}>Track: </span><span style={{ fontFamily: C.mono }}>{result.track}</span></div>}
            {result.password && <div><span style={{ color: C.muted }}>Password: </span><span style={{ fontFamily: C.mono }}>{result.password}</span></div>}
            <div style={{ color: C.muted, fontSize: 11 }}>Expires in {Math.max(0, Math.floor(result.expiresIn / 60))} min</div>
          </div>
        )}

        {result && <Btn style={{ width: '100%' }} onClick={connect}>Connect in AC</Btn>}
      </div>
    </div>
  )
}

// ── Pit Board ─────────────────────────────────────────────────────────────────
function PitBoard({ server, onStop, onViewLogs, onShare }) {
  const [tick, setTick]     = useState(0)
  const [stopping, setStopping] = useState(false)
  const [players, setPlayers] = useState({ count: 0, clients: [] })

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const unsub = api.server.onPlayers(server.id, (data) => setPlayers(data))
    return unsub
  }, [server.id])

  const driverNames = players.clients?.length
    ? players.clients.map(c => (typeof c === 'string' ? c : c.DriverName || c.driverName || c.CarModel || 'Unknown')).join('\n')
    : 'No drivers connected'

  const elapsed = Math.floor((Date.now() - server.startedAt) / 1000)
  const hh = String(Math.floor(elapsed / 3600)).padStart(2,'0')
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0')
  const ss = String(elapsed % 60).padStart(2,'0')
  const uptime = elapsed > 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`

  const stop = async () => {
    setStopping(true)
    await onStop(server.id)
  }

  return (
    <div style={{ background: C.surface, border: `2px solid ${C.yellow}`, borderRadius: 8,
      overflow: 'hidden', position: 'relative', animation: 'fadeUp .3s ease' }}>
      <div style={{ height: 3, background: C.yellow }} />
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: C.head, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{server.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontFamily: C.mono }}>
              {server.config?.trackId || '—'}{server.config?.layoutId ? ` / ${server.config.layoutId}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <StatusDot online />
            <Tag color={C.green}>LIVE</Tag>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          <div title={driverNames} style={{ background: C.bg, borderRadius: 6, padding: '8px 10px', textAlign: 'center', cursor: 'default' }}>
            <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: C.yellow }}>
              {players.count}/{server.config?.maxClients || '?'}
            </div>
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Players</div>
          </div>
          {[
            { label: 'Port',     val: `:${server.config?.port || '?'}` },
            { label: 'Uptime',   val: uptime },
            { label: 'PID',      val: server.pid || '—' },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: C.yellow }}>{s.val}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Cars */}
        {server.config?.cars?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {server.config.cars.map(c => <Tag key={c} color={C.muted} size="xs">{c}</Tag>)}
          </div>
        )}

        {server.config?.password && (
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, fontFamily: C.mono }}>
            🔒 <span style={{ color: C.white }}>{server.config.password}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="subtle" size="sm" onClick={() => onViewLogs(server)}>View logs</Btn>
          <Btn variant="ghost" size="sm" onClick={() => onShare(server)}>Share</Btn>
          <Btn variant="ghost" size="sm" onClick={() => api.shell.openPath(server.logPath?.replace(/[^\\]+$/, '') || '')}>
            Open log folder
          </Btn>
          <Btn variant="danger" size="sm" disabled={stopping} onClick={stop}
            style={{ marginLeft: 'auto' }}>
            {stopping ? 'Stopping…' : 'Stop server'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Deploy View ───────────────────────────────────────────────────────────────
export default function DeployView({ onBuild }) {
  const { liveServers, removeLiveServer, showToast, identity } = useStore()
  const { socket } = useSocket(identity)
  const [logServer, setLogServer] = useState(null)
  const [shareServer, setShareServer] = useState(null)
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [joinPrefillCode, setJoinPrefillCode] = useState('')

  const stopServer = useCallback(async (id) => {
    const res = await api.server.stop(id)
    if (res.ok) {
      removeLiveServer(id)
      showToast('Server stopped')
    } else {
      showToast(`✕ ${res.error}`, C.red)
    }
  }, [removeLiveServer, showToast])

  // Someone else on the crew shared an invite.
  useEffect(() => {
    if (!socket) return
    const onInviteCreated = ({ code, serverName, createdBy }) => {
      showToast(`${createdBy || 'Someone'} shared an invite for ${serverName} — code: ${code}`, C.blue)
    }
    socket.on('invite:created', onInviteCreated)
    return () => socket.off('invite:created', onInviteCreated)
  }, [socket, showToast])

  // accomp:// URLs arrive here from main.js — either a shared invite code
  // (opens Join pre-filled) or a direct host:port "Connect in AC" round-trip.
  useEffect(() => {
    const unsub = api.protocol.onOpen((url) => {
      const payload = url.replace(/^accomp:\/\//i, '').replace(/\/$/, '')
      if (/^[A-Z0-9]{6}$/i.test(payload)) {
        setJoinPrefillCode(payload.toUpperCase())
        setJoinModalOpen(true)
      } else {
        showToast(`Connect request received: ${payload}`, C.blue)
      }
    })
    return unsub
  }, [showToast])

  const openJoinModal = () => { setJoinPrefillCode(''); setJoinModalOpen(true) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="ghost" size="sm" onClick={openJoinModal}>Join server</Btn>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {liveServers.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 16, color: C.muted }}>
            <div style={{ fontSize: 52 }}>🏁</div>
            <div style={{ fontFamily: C.head, fontSize: 24, color: C.white }}>No servers running</div>
            <div style={{ fontSize: 14 }}>Build and launch a server to see it here</div>
            <Btn onClick={onBuild} size="lg" style={{ marginTop: 8 }}>Build a server</Btn>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
              {liveServers.map(s => (
                <PitBoard key={s.id} server={s} onStop={stopServer} onViewLogs={setLogServer} onShare={setShareServer} />
              ))}
            </div>
          </div>
        )}
      </div>

      {logServer && <LogPanel server={logServer} onClose={() => setLogServer(null)} />}
      {shareServer && (
        <ShareModal server={shareServer} identity={identity} onClose={() => setShareServer(null)} showToast={showToast} />
      )}
      {joinModalOpen && (
        <JoinModal prefillCode={joinPrefillCode} onClose={() => setJoinModalOpen(false)} showToast={showToast} />
      )}
    </div>
  )
}
