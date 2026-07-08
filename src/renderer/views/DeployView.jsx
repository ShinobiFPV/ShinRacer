import { useState, useEffect, useRef, useCallback } from 'react'
import { C, Card, Tag, Btn, StatusDot, SectionHead } from '../components/primitives'
import { useStore } from '../store/AppStore'

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

// ── Pit Board ─────────────────────────────────────────────────────────────────
function PitBoard({ server, onStop, onViewLogs }) {
  const [tick, setTick]     = useState(0)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

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
          {[
            { label: 'Players',  val: `${server.players || 0}/${server.config?.maxClients || '?'}` },
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
  const { liveServers, removeLiveServer, showToast } = useStore()
  const [logServer, setLogServer] = useState(null)

  const stopServer = useCallback(async (id) => {
    const res = await api.server.stop(id)
    if (res.ok) {
      removeLiveServer(id)
      showToast('Server stopped')
    } else {
      showToast(`✕ ${res.error}`, C.red)
    }
  }, [removeLiveServer, showToast])

  if (liveServers.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 16, color: C.muted }}>
        <div style={{ fontSize: 52 }}>🏁</div>
        <div style={{ fontFamily: C.head, fontSize: 24, color: C.white }}>No servers running</div>
        <div style={{ fontSize: 14 }}>Build and launch a server to see it here</div>
        <Btn onClick={onBuild} size="lg" style={{ marginTop: 8 }}>Build a server</Btn>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
        {liveServers.map(s => (
          <PitBoard key={s.id} server={s} onStop={stopServer} onViewLogs={setLogServer} />
        ))}
      </div>
      {logServer && <LogPanel server={logServer} onClose={() => setLogServer(null)} />}
    </div>
  )
}
