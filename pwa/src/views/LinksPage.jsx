import { useRef, useState } from 'react'
import { C } from '../lib/colors'
import { Btn, Card, TextInput, Label, PageTitle, FAB, BottomSheet } from '../components/primitives'
import { CATEGORIES, PRESET_LINKS } from '../lib/presetLinks'

const USER_LINKS_KEY = 'shinracer_user_links'

function loadUserLinks() {
  try { return JSON.parse(localStorage.getItem(USER_LINKS_KEY) || '[]') } catch { return [] }
}
function saveUserLinks(links) {
  localStorage.setItem(USER_LINKS_KEY, JSON.stringify(links))
}

function useLongPress(onLongPress, ms = 550) {
  const timer = useRef(null)
  const start = () => { timer.current = setTimeout(onLongPress, ms) }
  const clear = () => { if (timer.current) clearTimeout(timer.current) }
  return {
    onTouchStart: start, onTouchEnd: clear, onTouchMove: clear,
    onContextMenu: (e) => { e.preventDefault(); onLongPress() },
  }
}

function LinkCard({ link, onCopied }) {
  const longPress = useLongPress(() => {
    navigator.clipboard?.writeText(link.url)
    onCopied?.(link.id)
  })
  return (
    <Card {...longPress} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: C.head, fontSize: 16 }}>{link.name}</div>
        <div style={{ fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.description}</div>
      </div>
      <Btn size="sm" variant="outline" onClick={() => window.open(link.url, '_blank', 'noopener')}>Visit</Btn>
    </Card>
  )
}

function AddLinkSheet({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', url: '', category: 'other', description: '' })
  const [error, setError] = useState(null)
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  function submit() {
    if (!form.name || !form.url.startsWith('http')) { setError('Name and a valid http(s) URL are required.'); return }
    onAdd({ ...form, id: `u_${Date.now()}` })
    onClose()
  }

  return (
    <BottomSheet open onClose={onClose} title="Add link">
      <Label>Name</Label>
      <TextInput value={form.name} onChange={set('name')} style={{ marginBottom: 12 }} />
      <Label>URL</Label>
      <TextInput value={form.url} onChange={set('url')} placeholder="https://" style={{ marginBottom: 12 }} />
      <Label>Category</Label>
      <select value={form.category} onChange={e => set('category')(e.target.value)}
        style={{ width: '100%', minHeight: 44, background: C.raised, border: `1px solid ${C.border}`, color: C.textPrimary, marginBottom: 12 }}>
        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <Label>Description</Label>
      <TextInput value={form.description} onChange={set('description')} style={{ marginBottom: 16 }} />
      {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <Btn full size="lg" onClick={submit}>Add link</Btn>
    </BottomSheet>
  )
}

export default function LinksPage() {
  const [userLinks, setUserLinks] = useState(loadUserLinks())
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  function addLink(link) {
    const next = [...userLinks, link]
    setUserLinks(next)
    saveUserLinks(next)
  }

  function onCopied(id) {
    setCopiedId(id)
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1500)
  }

  const all = [...PRESET_LINKS, ...userLinks]
  const filtered = search
    ? all.filter(l => `${l.name} ${l.description} ${l.url}`.toLowerCase().includes(search.toLowerCase()))
    : null

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 32, padding: '0 16px' }}>
      <PageTitle style={{ padding: '16px 0 12px' }}>Links</PageTitle>
      <TextInput value={search} onChange={setSearch} placeholder="Search links…" style={{ marginBottom: 16 }} />

      {copiedId && <div style={{ color: C.green, fontSize: 12, marginBottom: 8 }}>Copied to clipboard.</div>}

      {filtered ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(l => <LinkCard key={l.id} link={l} onCopied={onCopied} />)}
        </div>
      ) : (
        CATEGORIES.map(cat => {
          const links = all.filter(l => l.category === cat.id)
          if (links.length === 0) return null
          return (
            <div key={cat.id} style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: C.head, fontSize: 16, color: C.blue, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {cat.emoji} {cat.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {links.map(l => <LinkCard key={l.id} link={l} onCopied={onCopied} />)}
              </div>
            </div>
          )
        })
      )}

      <FAB onClick={() => setShowAdd(true)}>+</FAB>
      {showAdd && <AddLinkSheet onClose={() => setShowAdd(false)} onAdd={addLink} />}
    </div>
  )
}
