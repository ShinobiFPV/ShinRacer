import { useEffect, useMemo, useState } from 'react'
import { C } from '../lib/colors'
import { Btn, Card, Chip, TextInput, Label, PageTitle, BottomSheet, FAB, EmptyState, OfflineBanner } from '../components/primitives'
import api, { getBackendUrl } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import { useBackend } from '../hooks/useBackend'

const CATEGORY_COLOR = { cars: C.red, tracks: C.green, tools: C.blue }
const CATEGORIES = ['all', 'cars', 'tracks', 'tools']

function downloadFile(fileId, name) {
  const a = document.createElement('a')
  a.href = `${getBackendUrl()}/api/mods/download/${fileId}`
  a.download = name || ''
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}

function UploadSheet({ onClose, tokens }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('cars')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  async function submit() {
    if (!name || !file) { setError('Name and a file are required.'); return }
    setError(null)
    setProgress(0)
    try {
      const body = new FormData()
      body.append('name', name)
      body.append('category', category)
      body.append('description', description)
      body.append('mod', file)
      await api.post('/api/mods/upload', body, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
      })
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
      setProgress(null)
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Upload mod">
      <Label>Name</Label>
      <TextInput value={name} onChange={setName} placeholder="Mod name" style={{ marginBottom: 12 }} />
      <Label>Category</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['cars', 'tracks', 'tools'].map(c => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>
        ))}
      </div>
      <Label>Description</Label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
        style={{ width: '100%', background: C.raised, border: `1px solid ${C.border}`, color: C.textPrimary, fontFamily: C.body, fontSize: 15, padding: 10, marginBottom: 12 }} />
      <Label>File (.zip)</Label>
      <input type="file" accept=".zip" onChange={e => setFile(e.target.files[0])} style={{ marginBottom: 16, color: C.textSec }} />
      {progress !== null && (
        <div style={{ height: 6, background: C.border, marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: C.blue }} />
        </div>
      )}
      {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <Btn full size="lg" onClick={submit} disabled={progress !== null && progress < 100}>
        {progress !== null ? `Uploading… ${progress}%` : 'Upload'}
      </Btn>
    </BottomSheet>
  )
}

export default function ModsPage() {
  const { user, tokens, isLoggedIn, login } = useAuth()
  const { isOnline } = useBackend()
  const [data, setData] = useState({ cars: [], tracks: [], tools: [], uploads: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [showUpload, setShowUpload] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data: res } = await api.get('/api/mods')
      if (res.ok) setData(res.data)
      else setError(res.error)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const allMods = useMemo(() => [
    ...data.cars.map(m => ({ ...m, category: 'cars' })),
    ...data.tracks.map(m => ({ ...m, category: 'tracks' })),
    ...data.tools.map(m => ({ ...m, category: 'tools' })),
  ], [data])

  const filtered = allMods.filter(m =>
    (category === 'all' || m.category === category) &&
    (!search || m.name.toLowerCase().includes(search.toLowerCase())))

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 32 }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <PageTitle style={{ marginBottom: 12 }}>Mods</PageTitle>
        <TextInput value={search} onChange={setSearch} placeholder="Search mods…" style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {CATEGORIES.map(c => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}
        </div>
      </div>

      <OfflineBanner show={isOnline === false} />
      {error && (
        <div style={{ margin: '0 16px 12px', padding: 12, background: `${C.red}18`, border: `1px solid ${C.red}60`, color: C.red, fontSize: 13 }}>
          Could not reach Google Drive: {error}
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div style={{ color: C.muted, textAlign: 'center', padding: 24 }}>Loading…</div>}
        {!loading && filtered.length === 0 && !error && (
          <EmptyState emoji="📦" title="Nothing here" subtitle="Try a different search or category." />
        )}
        {filtered.map(m => (
          <Card key={m.id} accent={CATEGORY_COLOR[m.category]}>
            <div style={{ fontFamily: C.head, fontSize: 16, marginBottom: 2 }}>{m.name}</div>
            {m.description && (
              <div style={{ fontSize: 13, color: C.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {m.description}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <div style={{ fontSize: 11, color: C.muted }}>{formatBytes(Number(m.size))} · {formatDate(m.modifiedTime)}</div>
              <Btn size="sm" variant="ghost" onClick={() => downloadFile(m.id, m.name)}>Download</Btn>
            </div>
          </Card>
        ))}
      </div>

      {!isLoggedIn ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Sign in to upload mods to the library</div>
          <Btn onClick={() => login('/mods')}>Sign in with Google</Btn>
        </div>
      ) : (
        <FAB onClick={() => setShowUpload(true)}>+</FAB>
      )}

      {showUpload && <UploadSheet onClose={() => { setShowUpload(false); load() }} tokens={tokens} />}
    </div>
  )
}
