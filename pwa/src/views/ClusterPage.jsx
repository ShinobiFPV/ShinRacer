import { useEffect, useRef, useState } from 'react'
import { C } from '../lib/colors'
import { Btn, Chip, EmptyState } from '../components/primitives'
import api from '../lib/api'
import { getIdentity } from '../lib/auth'
import { useSocket } from '../hooks/useSocket'
import ClusterRuntime from '../components/cluster/ClusterRuntime'

const LAST_PRESET_KEY = 'cluster_lastPreset'
const POLL_MS = 500

// Runtime only — no editor on mobile, per spec. Full-screen, no chrome by
// default once a preset is loaded; the header collapses to a thin blue
// strip to maximise usable screen for the actual button box.
export default function ClusterPage() {
  const identity = getIdentity()
  const { socket } = useSocket(identity)
  const [presets, setPresets] = useState({ mine: [], public: [] })
  const [tab, setTab] = useState('mine')
  const [layout, setLayout] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [scale, setScale] = useState(1)
  const [toast, setToast] = useState(null)
  const [frame, setFrame] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    api.get('/api/cluster/presets', { params: { author: identity?.handle } }).then(({ data }) => {
      if (!data.ok) return
      const mine = data.data.filter(p => p.author === identity?.handle)
      const pub = data.data
      setPresets({ mine, public: pub })
      const lastId = localStorage.getItem(LAST_PRESET_KEY)
      if (lastId) loadPreset(lastId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.handle])

  // Live telemetry — polling GET /api/telemetry/latest every 500ms, not a
  // socket subscription, to save battery (per spec).
  useEffect(() => {
    const interval = setInterval(() => {
      api.get('/api/telemetry/latest').then(({ data }) => { if (data.ok) setFrame(data.data) }).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  // Scale the canvas to fit the available screen while keeping aspect ratio.
  useEffect(() => {
    if (!layout || !containerRef.current) return
    function recalc() {
      const rect = containerRef.current.getBoundingClientRect()
      setScale(Math.min(rect.width / layout.canvasWidth, rect.height / layout.canvasHeight, 1))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [layout, collapsed])

  async function loadPreset(id) {
    try {
      const { data } = await api.get(`/api/cluster/presets/${id}`)
      if (data.ok) { setLayout(data.data.layout); localStorage.setItem(LAST_PRESET_KEY, id) }
    } catch (e) { /* preset may have been deleted since last visit */ }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2500)
  }

  function handleAction({ action, event }) {
    if (!action || action.type === 'none') return
    if (event !== 'press' && event !== 'change') return
    if (action.type === 'keystroke') {
      showToast("Key bindings don't work on mobile — use App Function bindings")
      return
    }
    if (action.type === 'appFunction') {
      if (!identity?.handle) { showToast('Sign in to use this preset'); return }
      socket?.emit('cluster:action', { fn: action.fn, param: action.fnParam, from: identity.handle })
    }
  }

  function requestFullscreen() {
    containerRef.current?.requestFullscreen?.().catch(() => {})
  }

  if (!layout) {
    return (
      <div style={{ padding: 16, paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 2, marginBottom: 16 }}>THE CLUSTER FUCKER</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Chip active={tab === 'mine'} onClick={() => setTab('mine')}>My presets</Chip>
          <Chip active={tab === 'public'} onClick={() => setTab('public')}>Public presets</Chip>
        </div>
        {(tab === 'mine' ? presets.mine : presets.public).length === 0 ? (
          <EmptyState emoji="🎛️" title="No presets yet" subtitle="Build one in the ShinRacer desktop app, then load it here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(tab === 'mine' ? presets.mine : presets.public).map(p => (
              <button key={p.id} onClick={() => loadPreset(p.id)} style={{
                textAlign: 'left', padding: 14, background: C.surface, border: `1px solid ${C.border}`, color: C.textPrimary,
              }}>
                <div style={{ fontFamily: C.head, fontSize: 16 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>by {p.author} · {p.widgetCount} widgets</div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
      {collapsed ? (
        <button onClick={() => setCollapsed(false)} style={{ height: 4, background: C.blue, width: '100%', flexShrink: 0 }} />
      ) : (
        <div style={{
          height: 44, paddingTop: 'env(safe-area-inset-top)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
          background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <button onClick={() => setLayout(null)} style={{ color: C.textSec, fontSize: 18 }}>‹</button>
          <span style={{ fontFamily: C.head, fontSize: 16, letterSpacing: 1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {layout.name}
          </span>
          <Btn size="sm" variant="ghost" onClick={requestFullscreen}>Fullscreen</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setCollapsed(true)}>Collapse</Btn>
        </div>
      )}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
          <ClusterRuntime layout={layout} telemetryFrame={frame} onAction={handleAction} />
        </div>
      </div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          background: C.surface, border: `1px solid ${C.orange}`, color: C.orange, padding: '8px 16px', fontSize: 12, maxWidth: '90%', textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
