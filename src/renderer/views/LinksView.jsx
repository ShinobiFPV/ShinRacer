import { useState, useEffect, useMemo } from 'react'
import { C, Card, Label, Btn, TextInput, Select, Tag } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'

const api = window.api

const CATEGORIES = [
  { id: 'tracks_cars',  label: 'Tracks & Cars',  emoji: '🏎️' },
  { id: 'tools_apps',   label: 'Tools & Apps',   emoji: '🛠️' },
  { id: 'communities',  label: 'Communities',    emoji: '💬' },
  { id: 'youtube',      label: 'YouTube',        emoji: '▶️' },
  { id: 'setup_guides', label: 'Setup & Guides', emoji: '📖' },
  { id: 'other',        label: 'Other',          emoji: '🔗' },
]

// Hardcoded, never fetched/stored/sent to backend — see CLAUDE.md constraints.
const PRESET_LINKS = [
  // Tracks & Cars (Mods)
  { id: 'p_rd_tracks', category: 'tracks_cars', name: 'RaceDepartment — Tracks', url: 'https://www.racedepartment.com/downloads/categories/tracks.4/',
    description: 'The biggest community mod archive for AC. Start here.' },
  { id: 'p_overtake', category: 'tracks_cars', name: 'Overtake.gg', url: 'https://www.overtake.gg/downloads/categories/assetto-corsa.9/',
    description: 'Modern RD successor. Clean UI, active uploads.' },
  { id: 'p_ac_content', category: 'tracks_cars', name: 'AC Content (Google Drive collections)', url: 'https://acstuff.ru/app/',
    description: "Content Manager's built-in mod browser." },
  { id: 'p_rd_cars', category: 'tracks_cars', name: 'RD — Cars', url: 'https://www.racedepartment.com/downloads/categories/cars.5/',
    description: 'Community car mods, everything from road cars to race prototypes.' },
  // Tools & Apps
  { id: 'p_cm', category: 'tools_apps', name: 'Content Manager', url: 'https://acstuff.ru/app/',
    description: "The essential AC launcher. If you don't have this, get it now." },
  { id: 'p_csp', category: 'tools_apps', name: 'Custom Shaders Patch (CSP)', url: 'https://acstuff.ru/patch/',
    description: 'Unlocks advanced graphics, AI traffic, and hundreds of fixes.' },
  { id: 'p_sol', category: 'tools_apps', name: 'sol (WeatherFX)', url: 'https://www.racedepartment.com/downloads/sol.24914/',
    description: 'The gold standard weather mod for AC.' },
  { id: 'p_crewchief', category: 'tools_apps', name: 'CrewChief', url: 'https://thecrewchief.org/',
    description: 'Voice-activated spotter and race engineer. Works with AC.' },
  { id: 'p_helicorsa', category: 'tools_apps', name: 'Helicorsa', url: 'https://www.racedepartment.com/downloads/helicorsa.10296/',
    description: 'Proximity radar overlay. Essential for wheel-to-wheel racing.' },
  { id: 'p_stracker', category: 'tools_apps', name: 'stracker', url: 'https://strikerarena.com/stracker',
    description: 'Lap time tracking and server statistics.' },
  { id: 'p_asm', category: 'tools_apps', name: 'AC Server Manager (original)', url: 'https://github.com/JustaPenguin/assetto-server-manager',
    description: 'The open source server manager that inspired parts of ShinRacer.' },
  // Communities
  { id: 'p_reddit', category: 'communities', name: 'Assetto Corsa subreddit', url: 'https://www.reddit.com/r/assettocorsa/',
    description: 'General AC community. Good for mod discovery and setup help.' },
  { id: 'p_rd_forums', category: 'communities', name: 'RaceDepartment Forums', url: 'https://www.racedepartment.com/forums/assetto-corsa.165/',
    description: 'Deep technical discussions, mod releases, setup sharing.' },
  { id: 'p_csp_discord', category: 'communities', name: 'CSP Discord', url: 'https://discord.gg/assetto-corsa',
    description: 'Official-ish AC community Discord. CSP devs sometimes appear.' },
  { id: 'p_srp', category: 'communities', name: 'Shutoko Revival Project', url: 'https://www.shutoko.eu/',
    description: 'Home of SRP. Check here for updates and traffic configs.' },
  // YouTube
  { id: 'p_jimmy', category: 'youtube', name: 'Jimmy Broadbent', url: 'https://www.youtube.com/@JimmyBroadbent',
    description: 'The gateway drug. High quality AC content and reviews.' },
  { id: 'p_jardier', category: 'youtube', name: 'Jardier', url: 'https://www.youtube.com/@Jardier',
    description: 'Drift-focused. Great for technique and car setup inspiration.' },
  { id: 'p_aris', category: 'youtube', name: 'Aris Drives', url: 'https://www.youtube.com/@ArisDrives',
    description: 'Kunos physics lead. Deep dives into car setup and AC mechanics.' },
  { id: 'p_morad', category: 'youtube', name: 'Daniel Morad', url: 'https://www.youtube.com/@DanielMorad',
    description: 'Real racing driver doing sim content. Surprisingly useful setups.' },
  // Setup & Guides
  { id: 'p_lut', category: 'setup_guides', name: 'LUT Generator (FFB)', url: 'https://www.racedepartment.com/downloads/lut-generator-for-ac.9740/',
    description: 'Generate a custom force feedback lookup table for your wheel.' },
  { id: 'p_setup_guide', category: 'setup_guides', name: 'AC Setup Guide (RD)', url: 'https://www.racedepartment.com/threads/beginners-guide-to-car-setup.133264/',
    description: 'Beginner-friendly car setup fundamentals.' },
  { id: 'p_csp_wiki', category: 'setup_guides', name: 'CSP Wiki', url: 'https://github.com/ac-custom-shaders-patch/acc-lua-documentation',
    description: 'Technical CSP documentation. For the adventurous.' },
]

function LinkCard({ link, confirming, onEdit, onDelete, onConfirmDelete, onCancelConfirm, onHide, onUnhide, showToast }) {
  const [hover, setHover] = useState(false)

  const visit = () => api.shell.openExternal(link.url)
  const copy = () => { navigator.clipboard.writeText(link.url); showToast('✓ Copied link') }

  return (
    <Card
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        border: `1px solid ${C.border}`,
        borderLeft: `2px solid ${hover ? C.borderHi : C.border}`,
        background: hover ? C.raised : C.surface,
        opacity: link.isHidden ? 0.55 : 1,
        transition: 'border-color .12s, background .12s',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontFamily: C.head, fontSize: 18, lineHeight: 1.2 }}>{link.name}</div>
        {link.preset && <Tag color={C.blue} size="xs">⭐ ShinTech</Tag>}
      </div>
      <div style={{ fontSize: 12, color: C.muted, display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 32 }}>
        {link.description || 'No description'}
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {link.url}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6, alignItems: 'center' }}>
        <Tooltip text="Open this link in your browser">
          <Btn size="xs" variant="ghost" onClick={visit}>Visit →</Btn>
        </Tooltip>
        <Tooltip text="Copy the URL to clipboard">
          <Btn size="xs" variant="ghost" onClick={copy}>Copy</Btn>
        </Tooltip>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {link.preset ? (
            link.isHidden ? (
              <Tooltip text="Show this link again">
                <Btn size="xs" variant="ghost" onClick={onUnhide}>Show</Btn>
              </Tooltip>
            ) : (
              <Tooltip text="Hide this preset link from your list">
                <Btn size="xs" variant="ghost" onClick={onHide}>Hide</Btn>
              </Tooltip>
            )
          ) : confirming ? (
            <>
              <Btn size="xs" variant="danger" onClick={onConfirmDelete}>Confirm</Btn>
              <Btn size="xs" variant="ghost" onClick={onCancelConfirm}>Cancel</Btn>
            </>
          ) : (
            <>
              <Tooltip text="Change the name, URL, or category of this link">
                <Btn size="xs" variant="ghost" onClick={onEdit}>✏</Btn>
              </Tooltip>
              <Tooltip text="Remove this link from your list">
                <Btn size="xs" variant="ghost" onClick={onDelete}>✕</Btn>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

function LinkModal({ initial, onClose, onSave }) {
  const isEdit = !!initial
  const [form, setForm] = useState(initial
    ? { name: initial.name, url: initial.url, description: initial.description || '', category: initial.category }
    : { name: '', url: '', description: '', category: CATEGORIES[0].id })
  const [error, setError] = useState('')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!/^https?:\/\//i.test(form.url.trim())) { setError('URL must start with http:// or https://'); return }
    onSave({ ...form, name: form.name.trim(), url: form.url.trim() })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: 24, animation: 'fadeUp .18s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 17 }}>{isEdit ? 'Edit link' : 'Add link'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <Label>Name</Label>
        <div style={{ marginBottom: 12 }}><TextInput value={form.name} onChange={v => set('name', v)} placeholder="e.g. My favorite mod site" /></div>

        <Label>URL</Label>
        <div style={{ marginBottom: 12 }}><TextInput value={form.url} onChange={v => set('url', v)} placeholder="https://…" mono /></div>

        <Label>Description (optional)</Label>
        <div style={{ marginBottom: 12 }}>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="What is this?"
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textPrimary,
              padding: '8px 10px', fontSize: 12, fontFamily: C.body, resize: 'vertical', outline: 'none' }} />
        </div>

        <Label>Category</Label>
        <div style={{ marginBottom: 16 }}>
          <Select value={form.category} onChange={v => set('category', v)} options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))} />
        </div>

        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save</Btn>
        </div>
      </div>
    </div>
  )
}

export default function LinksView() {
  const { showToast } = useStore()
  const [userLinks, setUserLinks] = useState([])
  const [hiddenPresets, setHiddenPresets] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    api.store.get('userLinks').then(v => setUserLinks(v || []))
    api.store.get('hiddenPresets').then(v => setHiddenPresets(v || []))
  }, [])

  const persistUserLinks = (next) => { setUserLinks(next); api.store.set('userLinks', next) }
  const persistHidden = (next) => { setHiddenPresets(next); api.store.set('hiddenPresets', next) }

  const toggleHidden = (id) => {
    persistHidden(hiddenPresets.includes(id) ? hiddenPresets.filter(x => x !== id) : [...hiddenPresets, id])
  }

  const openAdd = () => { setEditingLink(null); setModalOpen(true) }
  const openEdit = (link) => { setEditingLink(link); setModalOpen(true) }

  const saveLink = (data) => {
    if (editingLink) {
      persistUserLinks(userLinks.map(l => (l.id === editingLink.id ? { ...l, ...data } : l)))
      showToast('✓ Link updated')
    } else {
      persistUserLinks([...userLinks, { ...data, id: `link_${Date.now()}`, addedAt: new Date().toISOString() }])
      showToast('✓ Link added')
    }
    setModalOpen(false)
  }

  const deleteLink = (id) => {
    persistUserLinks(userLinks.filter(l => l.id !== id))
    setConfirmDeleteId(null)
    showToast('Link removed')
  }

  const allLinks = useMemo(() => {
    const presets = PRESET_LINKS.map(l => ({ ...l, preset: true, isHidden: hiddenPresets.includes(l.id) }))
    const users = userLinks.map(l => ({ ...l, preset: false, isHidden: false }))
    return [...presets, ...users]
  }, [userLinks, hiddenPresets])

  const visibleLinks = allLinks.filter(l => showHidden || !l.isHidden)

  const searchQuery = search.trim().toLowerCase()
  const searched = searchQuery
    ? visibleLinks.filter(l =>
        l.name.toLowerCase().includes(searchQuery) ||
        (l.description || '').toLowerCase().includes(searchQuery) ||
        l.url.toLowerCase().includes(searchQuery))
    : null

  const byCategory = useMemo(() => {
    const map = {}
    visibleLinks.forEach(l => { (map[l.category] ||= []).push(l) })
    return map
  }, [visibleLinks])

  const isEmpty = allLinks.length === 0

  const cardProps = (link) => ({
    link,
    confirming: confirmDeleteId === link.id,
    onEdit: () => openEdit(link),
    onDelete: () => setConfirmDeleteId(link.id),
    onConfirmDelete: () => deleteLink(link.id),
    onCancelConfirm: () => setConfirmDeleteId(null),
    onHide: () => toggleHidden(link.id),
    onUnhide: () => toggleHidden(link.id),
    showToast,
  })

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 24 }}>🔗 Links</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {hiddenPresets.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
              Show hidden ({hiddenPresets.length})
            </label>
          )}
          <Tooltip text="Add a new bookmark to your links collection">
            <Btn onClick={openAdd}>+ Add link</Btn>
          </Tooltip>
        </div>
      </div>

      <div style={{ marginBottom: 24, maxWidth: 420, position: 'relative' }}>
        <TextInput value={search} onChange={setSearch} placeholder="Search links…" />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 11 }}>
            Clear
          </button>
        )}
      </div>

      {isEmpty ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 0', gap: 14, color: C.muted }}>
          <div style={{ fontSize: 32 }}>🔗</div>
          <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, textTransform: 'uppercase', color: C.muted }}>No links yet</div>
          <Btn onClick={openAdd}>Add your first link</Btn>
        </div>
      ) : searched ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {searched.length === 0
            ? <div style={{ color: C.muted, fontSize: 13, gridColumn: '1 / -1' }}>No links match your search</div>
            : searched.map(l => <LinkCard key={l.id} {...cardProps(l)} />)}
        </div>
      ) : (
        CATEGORIES.filter(c => byCategory[c.id]?.length).map(c => (
          <div key={c.id} style={{ marginBottom: 28 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: C.head, fontSize: 16, textTransform: 'uppercase',
                  letterSpacing: 2, color: C.blue, whiteSpace: 'nowrap' }}>
                  {c.emoji} {c.label}
                </span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ width: 40, height: 1, background: C.blue, marginTop: 4 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {byCategory[c.id].map(l => <LinkCard key={l.id} {...cardProps(l)} />)}
            </div>
          </div>
        ))
      )}

      {modalOpen && <LinkModal initial={editingLink} onClose={() => setModalOpen(false)} onSave={saveLink} />}
    </div>
  )
}
