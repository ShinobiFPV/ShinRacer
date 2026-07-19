import { useState, useEffect, useCallback } from 'react'
import httpApi from '../lib/api'
import { C, Card, SectionHead, Label, Btn, Select, Tag, StatusDot } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'

const ROLE_COLOR = { admin: C.red, host: C.blue, crew: C.muted }
const ROLE_OPTIONS = [
  { value: 'crew', label: 'Crew' },
  { value: 'host', label: 'Host' },
  { value: 'admin', label: 'Admin' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function CrewManagement({ showToast }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingUid, setSavingUid] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpApi.get('/api/admin/users')
      if (res.data.ok) setUsers(res.data.data)
    } catch (e) { showToast(`✕ ${e.response?.data?.error || e.message}`, C.red) }
    setLoading(false)
  }, [showToast])

  useEffect(() => { load() }, [load])

  const changeRole = async (uid, role) => {
    setSavingUid(uid)
    try {
      await httpApi.patch(`/api/admin/users/${uid}/role`, { role })
      setUsers(prev => prev.map(u => (u.uid === uid ? { ...u, role } : u)))
      showToast(`✓ Role updated to ${role}`, C.green)
    } catch (e) {
      showToast(`✕ ${e.response?.data?.error || e.message}`, C.red)
    }
    setSavingUid(null)
  }

  const counts = users.reduce((acc, u) => ({ ...acc, [u.role]: (acc[u.role] || 0) + 1 }), {})

  return (
    <Card accent={C.borderHi}>
      <SectionHead children="Crew management" sub="Every Google account that has ever signed in — role changes take effect immediately" />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {['admin', 'host', 'crew'].map(r => (
          <div key={r} style={{ flex: 1, border: `1px solid ${C.border}`, borderLeft: `2px solid ${ROLE_COLOR[r]}`, padding: '10px 14px' }}>
            <div style={{ fontFamily: C.head, fontSize: 24, color: ROLE_COLOR[r] }}>{counts[r] || 0}</div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{r}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: C.muted }}>Loading…</div>
      ) : users.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>No one has signed in yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {users.map(u => (
            <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              {u.picture
                ? <img src={u.picture} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.raised }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, width: 160, flexShrink: 0 }}>Last seen {formatDate(u.last_seen)}</div>
              <Tooltip text="Change this user's role — takes effect on their next request">
                <Select value={u.role} onChange={v => changeRole(u.uid, v)} options={ROLE_OPTIONS} style={{ width: 120, opacity: savingUid === u.uid ? 0.5 : 1 }} />
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function HostStatusTable({ showToast }) {
  const [hosts, setHosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpApi.get('/api/admin/hosts')
      if (res.data.ok) setHosts(res.data.data)
    } catch (e) { showToast(`✕ ${e.response?.data?.error || e.message}`, C.red) }
    setLoading(false)
  }, [showToast])

  useEffect(() => { load() }, [load])

  const removeHost = async (uid) => {
    setRemoving(uid)
    try {
      await httpApi.delete(`/api/admin/hosts/${uid}`)
      setHosts(prev => prev.filter(h => h.uid !== uid))
      showToast('✓ Host removed', C.green)
    } catch (e) {
      showToast(`✕ ${e.response?.data?.error || e.message}`, C.red)
    }
    setRemoving(null)
  }

  return (
    <Card accent={C.borderHi}>
      <SectionHead children="Host status" sub="Machines registered to run game servers for crew events" />
      {loading ? (
        <div style={{ fontSize: 12, color: C.muted }}>Loading…</div>
      ) : hosts.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>No hosts registered yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {hosts.map(h => (
            <div key={h.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <StatusDot online={h.is_online} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{h.machine_name}</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, width: 160, flexShrink: 0 }}>Last seen {formatDate(h.last_seen)}</div>
              <Tooltip text="Remove this machine from the host list — proposers will no longer be able to select it">
                <Btn size="sm" variant="danger" onClick={() => removeHost(h.uid)} disabled={removing === h.uid}>
                  {removing === h.uid ? 'Removing…' : 'Remove'}
                </Btn>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ServerOverview() {
  const { liveServers } = useStore()
  return (
    <Card accent={C.borderHi}>
      <SectionHead children="Server overview" sub="Servers currently running on this machine — hosts running elsewhere aren't visible here" />
      {liveServers.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>No servers running on this machine.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {liveServers.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <StatusDot online={true} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{s.track} · {(s.cars || []).length} cars</div>
              </div>
              <Tag color={C.blue}>PID {s.pid}</Tag>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SystemHealth({ showToast }) {
  const [health, setHealth] = useState(null)
  const [restarting, setRestarting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await httpApi.get('/api/admin/system/health')
      if (res.data.ok) setHealth(res.data.data)
    } catch (e) { /* backend down — health just stays null, banner elsewhere already covers this */ }
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  const restart = async () => {
    if (!confirming) { setConfirming(true); return }
    setRestarting(true)
    try {
      await httpApi.post('/api/admin/system/restart')
      showToast('✓ Restart triggered — backend will be back in a few seconds', C.orange)
    } catch (e) {
      showToast(`✕ ${e.response?.data?.error || e.message}`, C.red)
    }
    setRestarting(false)
    setConfirming(false)
  }

  return (
    <Card accent={C.borderHi}>
      <SectionHead children="System health" sub="Backend process running on your-pi" />
      {health ? (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontSize: 12 }}>
          <div><Label>Uptime</Label>{Math.floor(health.uptime / 60)}m {Math.floor(health.uptime % 60)}s</div>
          <div><Label>Memory (RSS)</Label>{(health.memoryRss / 1024 / 1024).toFixed(1)} MB</div>
          <div><Label>Node</Label>{health.nodeVersion}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Backend unreachable.</div>
      )}
      <Tooltip text={confirming ? 'Click again to confirm — this restarts the live backend for everyone' : 'Restart the ac-companion service on your-pi'}>
        <Btn variant="danger" size="sm" onClick={restart} disabled={restarting}>
          {restarting ? 'Restarting…' : confirming ? 'Confirm restart' : 'Restart backend'}
        </Btn>
      </Tooltip>
      {confirming && !restarting && (
        <Btn variant="ghost" size="sm" onClick={() => setConfirming(false)} style={{ marginLeft: 8 }}>Cancel</Btn>
      )}
    </Card>
  )
}

export default function AdminView() {
  const { showToast } = useStore()
  return (
    <div style={{ padding: 28, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <CrewManagement showToast={showToast} />
      <HostStatusTable showToast={showToast} />
      <ServerOverview />
      <SystemHealth showToast={showToast} />
    </div>
  )
}
