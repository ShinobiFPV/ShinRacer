import { useState, useEffect, useMemo, useCallback } from 'react'
import { C, Card, Label, Btn, TextInput, Select, Tag, OfflineBanner } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { useSocket } from '../hooks/useSocket'
import api from '../lib/api'

const win = window.api
const SETUP_GUIDE_URL = 'https://github.com/ShinobiFPV/ShinRacer/blob/main/docs/GOOGLE_DRIVE_SETUP.md'

const CATEGORY_COLOR = { cars: C.red, tracks: C.green, tools: C.blue }
const CATEGORY_LABEL = { cars: 'Cars', tracks: 'Tracks', tools: 'Tools' }
const CATEGORY_EMOJI = { cars: '🚗', tracks: '🏁', tools: '🔧' }

function formatBytes(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  return `${(num / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

// Uploads land in a single flat Drive folder until William curates them into
// Cars/Tracks/Tools, so "uploaded by" and "which category" both have to be
// recovered from the description string the upload endpoint wrote (see
// backend/routes/mods.js — "Uploaded by: {name}\nCategory: {category}\n...").
function parseUploader(description) {
  const m = /Uploaded by:\s*(.+)/i.exec(description || '')
  return m ? m[1].trim() : null
}
function parseUploadCategory(description) {
  const m = /Category:\s*(cars|tracks|tools)/i.exec(description || '')
  return m ? m[1].toLowerCase() : 'tools'
}

function SkeletonCard() {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: 14 }}>
      <div className="shimmer-block" style={{ width: '100%', height: 4, marginBottom: 12 }} />
      <div className="shimmer-block" style={{ width: '70%', height: 16, marginBottom: 10 }} />
      <div className="shimmer-block" style={{ width: '100%', height: 11, marginBottom: 6 }} />
      <div className="shimmer-block" style={{ width: '90%', height: 11 }} />
    </div>
  )
}

function statusFor(mod, installs) {
  const installed = installs[mod.id]
  if (!installed) return 'install'
  if (installed.versionDate && mod.modifiedTime && new Date(mod.modifiedTime) > new Date(installed.versionDate)) return 'update'
  return 'installed'
}

function StatusBadge({ status }) {
  if (status === 'installed') return <Tag color={C.green}>Installed ✓</Tag>
  if (status === 'update') return <Tag color={C.orange}>Update available</Tag>
  return <Tag color={C.blue}>Install</Tag>
}

function ModCard({ mod, category, installs, onSelect, selected }) {
  const status = statusFor(mod, installs)
  return (
    <div onClick={onSelect} style={{ background: C.surface, border: `1px solid ${selected ? C.blue : C.border}`,
      borderLeft: `2px solid ${CATEGORY_COLOR[category] || C.muted}`,
      borderRadius: 0, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontFamily: C.head, fontSize: 18, lineHeight: 1.2 }}>{mod.name}</div>
          <StatusBadge status={status} />
        </div>
        <div style={{ fontSize: 12, color: C.muted, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 32 }}>
          {mod.description || 'No description'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', fontSize: 11 }}>
          <span style={{ fontFamily: C.mono, color: C.muted }}>{formatBytes(mod.size)}</span>
          <span style={{ color: C.muted }}>{formatDate(mod.modifiedTime)}</span>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ mod, category, installs, settings, identity, onInstalled, onClose, showToast }) {
  const [progress, setProgress] = useState(null) // null | 'downloading' | 'extracting' | 'done'
  const status = statusFor(mod, installs)
  const installed = installs[mod.id]
  const uploader = parseUploader(mod.description) || 'ShinTech'

  const install = async () => {
    if (!settings.acPath) return
    setProgress('downloading')
    const res = await win.mods.download({ fileId: mod.id, filename: mod.name, category })
    if (!res.ok) {
      showToast(`✕ ${res.error}`, C.red)
      setProgress(null)
      return
    }
    setProgress('extracting')
    try {
      await api.post('/api/mods/installs', { handle: identity.handle, fileId: mod.id, versionDate: mod.modifiedTime })
    } catch (e) { /* optimistic local update below still applies */ }
    onInstalled(mod.id, { installedAt: new Date().toISOString(), versionDate: mod.modifiedTime })
    setProgress('done')
    showToast(`✓ ${mod.name} installed`, C.green)
  }

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 360, background: C.surface,
      borderLeft: `1px solid ${C.border}`, padding: 24, overflowY: 'auto', animation: 'fadeUp .15s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <Tag color={CATEGORY_COLOR[category] || C.muted}>{CATEGORY_LABEL[category] || category}</Tag>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 22, marginBottom: 10 }}>{mod.name}</div>
      <div style={{ fontSize: 13, color: C.mutedHi, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
        {mod.description || 'No description provided.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, marginBottom: 20 }}>
        <div><span style={{ color: C.muted }}>Size: </span><span style={{ fontFamily: C.mono }}>{formatBytes(mod.size)}</span></div>
        <div><span style={{ color: C.muted }}>Modified: </span>{formatDate(mod.modifiedTime)}</div>
        <div><span style={{ color: C.muted }}>Uploaded by: </span>{uploader}</div>
      </div>

      {!settings.acPath ? (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 0,
          padding: '10px 12px', fontSize: 12, color: C.orange, marginBottom: 14 }}>
          Set AC path in Settings to install
        </div>
      ) : progress ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: progress === 'done' ? '100%' : '60%', background: C.blue,
              transition: 'width .3s', animation: progress === 'done' ? 'none' : 'pulse 1.2s infinite' }} />
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {progress === 'downloading' && 'Downloading…'}
            {progress === 'extracting' && 'Extracting…'}
            {progress === 'done' && 'Done ✓'}
          </div>
        </div>
      ) : status === 'installed' ? (
        <div style={{ marginBottom: 14 }}>
          <Btn disabled style={{ width: '100%' }} variant="success">✓ Installed</Btn>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <Tooltip text="Download and reinstall even if already up to date">
              <button onClick={install} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>Reinstall</button>
            </Tooltip>
            <span style={{ fontSize: 11, color: C.muted }}>{formatDate(installed.installedAt)}</span>
          </div>
        </div>
      ) : status === 'update' ? (
        <div style={{ marginBottom: 14 }}>
          <Tooltip text="Download the newer version from Drive and reinstall">
            <Btn style={{ width: '100%', background: C.orange }} onClick={install}>⬆ Update</Btn>
          </Tooltip>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Installed: {formatDate(installed.installedAt)} · Updated: {formatDate(mod.modifiedTime)}
          </div>
        </div>
      ) : (
        <Tooltip text="Download and auto-extract to your AC content folder">
          <Btn style={{ width: '100%', marginBottom: 14 }} onClick={install}>⬇ Install mod</Btn>
        </Tooltip>
      )}

      <Tooltip text="Open the folder where this mod is installed">
        <Btn size="sm" variant="ghost" onClick={() => win.mods.openFolder(category)}>Open in Explorer</Btn>
      </Tooltip>
    </div>
  )
}

function UploadModal({ onClose, onUploaded, googleAuth, showToast }) {
  const [form, setForm] = useState({ name: '', category: 'cars', description: '' })
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!file) { showToast('Choose a .zip file first', C.orange); return }
    if (!form.name.trim()) { showToast('Name is required', C.orange); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('category', form.category)
      fd.append('description', form.description)
      fd.append('mod', file)
      // Authorization already carries the app's ID token (added app-wide by
      // lib/api.js's interceptor) — the Drive access token needed to actually
      // write the upload rides in its own header instead of fighting over
      // Authorization with the ID token every other route relies on.
      const res = await api.post('/api/mods/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data', 'X-Drive-Access-Token': googleAuth.accessToken },
      })
      if (res.data.ok) {
        showToast(`${form.name} uploaded — William will review and move it to the library`, C.green)
        onUploaded()
        onClose()
      } else {
        showToast(`✕ ${res.data.error}`, C.red)
      }
    } catch (e) {
      showToast(`✕ ${e.response?.data?.error || e.message}`, C.red)
    }
    setUploading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 0, padding: 24, animation: 'fadeUp .18s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 17 }}>Upload mod</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <Label>Name</Label>
        <div style={{ marginBottom: 14 }}><TextInput value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Toyota AE86 Trueno" /></div>

        <Label>Category</Label>
        <div style={{ marginBottom: 14 }}>
          <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
            options={[{ value: 'cars', label: 'Cars' }, { value: 'tracks', label: 'Tracks' }, { value: 'tools', label: 'Tools' }]} />
        </div>

        <Label>Description</Label>
        <div style={{ marginBottom: 14 }}>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3} placeholder="What is this mod?"
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0,
              color: C.textPrimary, padding: '8px 10px', fontSize: 12, fontFamily: C.body, resize: 'vertical', outline: 'none' }} />
        </div>

        <Label>File (.zip)</Label>
        <div style={{ marginBottom: 18 }}>
          <input type="file" accept=".zip" onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ fontSize: 12, color: C.mutedHi }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</Btn>
        </div>
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'all', icon: '📦', label: 'All Mods' },
  { id: 'cars', icon: '🚗', label: 'Cars' },
  { id: 'tracks', icon: '🏁', label: 'Tracks' },
  { id: 'tools', icon: '🔧', label: 'Tools' },
]

export default function ModsView() {
  const { settings, identity, backendUrl, backendOnline, recheckBackend, showToast,
    googleAuth, user, signOut } = useStore()
  const { socket } = useSocket(identity)

  const [category, setCategory] = useState('all')
  const [modsData, setModsData] = useState({ cars: [], tracks: [], tools: [], uploads: [] })
  const [loading, setLoading] = useState(true)
  const [driveError, setDriveError] = useState(null)
  const [installs, setInstalls] = useState({})
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState('name')
  const [selected, setSelected] = useState(null) // { mod, category }
  const [uploadOpen, setUploadOpen] = useState(false)

  const loadMods = useCallback(async () => {
    setLoading(true)
    setDriveError(null)
    try {
      const res = await api.get('/api/mods')
      if (res.data.ok) {
        setModsData({ cars: [], tracks: [], tools: [], uploads: [], ...res.data.data })
      } else {
        setDriveError(res.data.error)
      }
    } catch (e) {
      setDriveError(e.response?.data?.error || e.message)
    }
    setLoading(false)
  }, [])

  const loadInstalls = useCallback(async () => {
    if (!identity?.handle) return
    try {
      const res = await api.get(`/api/mods/installs/${encodeURIComponent(identity.handle)}`)
      if (res.data.ok) {
        const map = {}
        res.data.data.forEach(r => { map[r.fileId] = r })
        setInstalls(map)
      }
    } catch (e) { /* leave installs as-is — install status just won't reflect prior state this session */ }
  }, [identity?.handle])

  useEffect(() => { loadMods() }, [loadMods])
  useEffect(() => { loadInstalls() }, [loadInstalls])

  // Google sign-in is handled once, app-wide, by AppStore.jsx (the Wizard
  // gates the whole app on it — by the time this view can even render,
  // googleAuth is already populated). ModsView used to run its own separate
  // OAuth exchange against the same accomp://oauth callback; that's gone —
  // see CLAUDE.md's Phase 12 notes on this consolidation.

  useEffect(() => {
    if (!socket) return
    const onUploaded = ({ name, category: cat, uploadedBy }) => {
      showToast(`📦 ${uploadedBy} uploaded ${name} to ${cat}`, C.blue)
      loadMods()
    }
    socket.on('mod:uploaded', onUploaded)
    return () => socket.off('mod:uploaded', onUploaded)
  }, [socket, showToast, loadMods])

  // Drive access token doesn't self-refresh here — if expired, sign the user
  // out app-wide and let the Wizard prompt a fresh sign-in.
  const ensureAuthValid = () => {
    if (googleAuth?.expiryDate && googleAuth.expiryDate < Date.now()) {
      signOut()
      showToast('Session expired, sign in again', C.orange)
      return false
    }
    return true
  }

  const openUpload = () => {
    if (!ensureAuthValid()) return
    setUploadOpen(true)
  }

  const rows = useMemo(() => {
    let list = []
    if (category === 'all') {
      list = [
        ...modsData.cars.map(m => ({ mod: m, category: 'cars' })),
        ...modsData.tracks.map(m => ({ mod: m, category: 'tracks' })),
        ...modsData.tools.map(m => ({ mod: m, category: 'tools' })),
      ]
    } else if (category === 'uploads') {
      list = modsData.uploads
        .filter(m => (parseUploader(m.description) || '').toLowerCase() === (user?.name || '').toLowerCase())
        .map(m => ({ mod: m, category: parseUploadCategory(m.description) }))
    } else {
      list = (modsData[category] || []).map(m => ({ mod: m, category }))
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(({ mod }) => mod.name.toLowerCase().includes(q) || (mod.description || '').toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
      if (sortMode === 'recent') return new Date(b.mod.modifiedTime) - new Date(a.mod.modifiedTime)
      if (sortMode === 'size') return (b.mod.size || 0) - (a.mod.size || 0)
      return a.mod.name.localeCompare(b.mod.name)
    })
  }, [category, modsData, search, sortMode, googleAuth])

  const nav = [...NAV_ITEMS, ...(googleAuth ? [{ id: 'uploads', icon: '⬆️', label: 'My Uploads' }] : [])]

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Left: category nav + auth */}
      <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', padding: '16px 10px' }}>
        <nav style={{ flex: 1 }}>
          {nav.map(n => (
            <Tooltip key={n.id} text={n.id === 'uploads' ? "Mods you've submitted — pending review by William" : 'Filter mods by type'}>
              <button onClick={() => { setCategory(n.id); setSelected(null) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 0, border: 'none', cursor: 'pointer', marginBottom: 2,
                  background: 'transparent',
                  color: category === n.id ? C.blue : C.muted,
                  fontFamily: C.body, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13, textAlign: 'left' }}>
                <span>{n.icon}</span>{n.label}
              </button>
            </Tooltip>
          ))}
        </nav>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user?.picture
              ? <img src={user.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.raised }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <Tooltip text="Sign out of Google — you'll need to sign back in to use ShinRacer">
                <button onClick={signOut} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 10, cursor: 'pointer', padding: 0 }}>Sign out</button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {!backendOnline && <OfflineBanner backendUrl={backendUrl} onRetry={recheckBackend} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}><TextInput value={search} onChange={setSearch} placeholder="Search mods…" /></div>
          <Select value={sortMode} onChange={setSortMode} style={{ width: 160 }}
            options={[{ value: 'name', label: 'Name A-Z' }, { value: 'recent', label: 'Recently added' }, { value: 'size', label: 'Size' }]} />
          <Tooltip text="Re-fetch the mod list from Google Drive">
            <Btn size="sm" variant="subtle" onClick={loadMods}>⟳</Btn>
          </Tooltip>
          {googleAuth && (
            <Tooltip text="Share a mod with the crew — William will review before it goes live">
              <Btn size="sm" onClick={openUpload}>+ Upload mod</Btn>
            </Tooltip>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {driveError ? (
            <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}60`, borderRadius: 0,
              padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <span style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>⚠ Could not reach Google Drive — check backend configuration</span>
              <button onClick={() => win.shell.openExternal(SETUP_GUIDE_URL)}
                style={{ background: 'none', border: 'none', color: C.mutedHi, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                View setup guide
              </button>
            </div>
          ) : loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 8 }}>
              {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 10, color: C.muted, marginTop: 60 }}>
              <div style={{ fontSize: 32 }}>{CATEGORY_EMOJI[category] || '📦'}</div>
              <div style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }}>No {category === 'all' ? '' : category + ' '}mods yet</div>
              {category === 'uploads' && googleAuth && (
                <Btn size="sm" variant="subtle" onClick={openUpload} style={{ marginTop: 6 }}>+ Upload mod</Btn>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 8 }}>
              {rows.map(({ mod, category: cat }) => (
                <ModCard key={mod.id} mod={mod} category={cat} installs={installs}
                  selected={selected?.mod.id === mod.id} onSelect={() => setSelected({ mod, category: cat })} />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <DetailPanel mod={selected.mod} category={selected.category} installs={installs}
            settings={settings} identity={identity}
            onInstalled={(fileId, row) => setInstalls(prev => ({ ...prev, [fileId]: row }))}
            onClose={() => setSelected(null)} showToast={showToast} />
        )}
      </div>

      {uploadOpen && (
        <UploadModal googleAuth={googleAuth} showToast={showToast}
          onClose={() => setUploadOpen(false)} onUploaded={loadMods} />
      )}
    </div>
  )
}
