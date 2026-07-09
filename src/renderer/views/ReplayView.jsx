import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { C, Card, Label, Btn, TextInput, Tag } from '../components/primitives'
import Tooltip from '../components/Tooltip'

const api = window.api
const SUGGESTED_TAGS = ['race', 'drift', 'hotlap', 'crash', 'keeper', 'review']

function hashColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

function formatDateTime(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

// ── Skeleton loading row ─────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 10, alignItems: 'center' }}>
      <div className="shimmer-block" style={{ width: 48, height: 48, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="shimmer-block" style={{ width: '60%', height: 14 }} />
        <div className="shimmer-block" style={{ width: '35%', height: 10 }} />
      </div>
    </div>
  )
}

// ── Replay list row ───────────────────────────────────────────────────────────
function ReplayRow({ replay, meta, anno, selected, onSelect, onToggleFavorite }) {
  const track = meta?.parsed ? meta.track : null
  const carCount = meta?.parsed ? meta.cars.length : null
  return (
    <div onClick={onSelect}
      style={{ display: 'flex', gap: 12, padding: 10, alignItems: 'center', cursor: 'pointer', borderRadius: 6,
        background: selected ? `${C.yellow}14` : 'transparent', border: `1px solid ${selected ? C.yellowDim : 'transparent'}` }}>
      <div style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0,
        background: hashColor(track || replay.filename) }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {meta === undefined ? (
          <>
            <div className="shimmer-block" style={{ width: '60%', height: 13, marginBottom: 6 }} />
            <div style={{ fontSize: 10, color: C.muted }}>Reading…</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {track || replay.filename}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{formatDateTime(replay.mtime)}</div>
          </>
        )}
      </div>
      {carCount != null && <Tag color={C.muted} size="xs">{carCount} car{carCount !== 1 ? 's' : ''}</Tag>}
      <Tooltip text="Mark as favorite to find it quickly later">
        <button onClick={e => { e.stopPropagation(); onToggleFavorite() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
            color: anno.favorite ? C.yellow : C.muted, flexShrink: 0 }}>
          {anno.favorite ? '★' : '☆'}
        </button>
      </Tooltip>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ replay, meta, anno, onUpdateAnnotation, onLaunch, onOpenFolder, showToast }) {
  const [tagInput, setTagInput] = useState('')
  const [notes, setNotes] = useState(anno.notes || '')
  const notesTimer = useRef(null)

  useEffect(() => { setNotes(anno.notes || '') }, [replay.path])

  const scheduleNotesSave = (value) => {
    setNotes(value)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => onUpdateAnnotation({ notes: value }), 500)
  }
  const flushNotesSave = () => {
    clearTimeout(notesTimer.current)
    onUpdateAnnotation({ notes })
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (!t || anno.tags.includes(t)) { setTagInput(''); return }
    onUpdateAnnotation({ tags: [...anno.tags, t] })
    setTagInput('')
  }
  const removeTag = (t) => onUpdateAnnotation({ tags: anno.tags.filter(x => x !== t) })
  const addSuggested = (t) => { if (!anno.tags.includes(t)) onUpdateAnnotation({ tags: [...anno.tags, t] }) }

  const launch = async () => {
    const res = await onLaunch(replay.path)
    if (!res.ok) showToast(`✕ ${res.error}`, C.red)
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 22 }}>
            {meta?.parsed ? meta.track : replay.filename}
          </div>
          {meta?.parsed && meta.trackConfig && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{meta.trackConfig}</div>
          )}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{formatDateTime(replay.mtime)}</div>
        </div>
        <Tooltip text="Mark as favorite to find it quickly later">
          <button onClick={() => onUpdateAnnotation({ favorite: !anno.favorite })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 32,
              color: anno.favorite ? C.yellow : C.muted }}>
            {anno.favorite ? '★' : '☆'}
          </button>
        </Tooltip>
      </div>

      {meta && !meta.parsed && (
        <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>Couldn't read replay metadata — showing file info only</div>
      )}

      <div style={{ marginTop: 20 }}>
        <Label>Cars</Label>
        {meta?.parsed && meta.cars.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {meta.cars.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', background: C.bg,
                border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12 }}>
                <span style={{ fontFamily: C.mono, color: C.mutedHi, flex: 1 }}>{c.model || 'Unknown car'}</span>
                <span style={{ color: c.driver ? C.white : C.muted, fontStyle: c.driver ? 'normal' : 'italic' }}>
                  {c.driver || 'Unknown driver'}
                </span>
                {c.skin && <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 11 }}>{c.skin}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.muted }}>No car data available</div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <Label>Tags</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {anno.tags.map(t => (
            <Tooltip key={t} text="Click to remove this tag">
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: C.mono,
                color: C.white, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 8px' }}>
                {t}
                <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
              </span>
            </Tooltip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tooltip text="Type a tag and press Enter (e.g. race, drift, keeper)">
            <TextInput value={tagInput} onChange={setTagInput} placeholder="Add tag…"
              onKeyDown={e => { if (e.key === 'Enter') addTag() }} />
          </Tooltip>
          <Btn size="sm" variant="subtle" onClick={addTag}>Add</Btn>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTED_TAGS.filter(t => !anno.tags.includes(t)).map(t => (
            <Tooltip key={t} text="Click to add this tag">
              <button onClick={() => addSuggested(t)}
                style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, background: 'transparent',
                  border: `1px dashed ${C.border}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                + {t}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Label>Notes</Label>
        <textarea value={notes} onChange={e => scheduleNotesSave(e.target.value)} onBlur={flushNotesSave}
          rows={4} placeholder="Notes about this replay…"
          style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
            color: C.white, padding: '8px 10px', fontSize: 12, fontFamily: C.body, resize: 'vertical', outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <Tooltip text="Open this replay in Assetto Corsa">
          <Btn onClick={launch}>▶ Launch replay</Btn>
        </Tooltip>
        <Tooltip text="Show this replay file in Windows Explorer">
          <Btn variant="ghost" onClick={onOpenFolder}>Open file location</Btn>
        </Tooltip>
      </div>
    </div>
  )
}

// ── Empty / banner states ─────────────────────────────────────────────────────
function NoReplaysState({ onOpenFolder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 14, color: C.muted }}>
      <div style={{ fontSize: 48 }}>🎬</div>
      <div style={{ fontFamily: C.head, fontSize: 20, color: C.white }}>No replays found</div>
      <div style={{ fontSize: 13 }}>Replays are saved automatically by AC after each session</div>
      <Btn size="sm" variant="subtle" onClick={onOpenFolder}>Open replay folder</Btn>
    </div>
  )
}

function FolderMissingBanner({ onGoSettings }) {
  return (
    <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 8,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, margin: '16px 24px 0' }}>
      <span style={{ color: C.orange, fontSize: 13, fontWeight: 600, flex: 1 }}>
        ⚠ Replay folder not found — check your AC path in Settings
      </span>
      <Btn size="xs" variant="subtle" onClick={onGoSettings}>Go to Settings</Btn>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function ReplayView({ onGoSettings, showToast }) {
  const [scanning, setScanning] = useState(true)
  const [found, setFound] = useState(true)
  const [replays, setReplays] = useState([])
  const [metadataMap, setMetadataMap] = useState({})
  const [annotationsMap, setAnnotationsMap] = useState({})
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('all')
  const [sortMode, setSortMode] = useState('date')
  const [selectedPath, setSelectedPath] = useState(null)

  const scan = useCallback(async () => {
    setScanning(true)
    const res = await api.replays.scan()
    setFound(res.found)
    setReplays(res.replays || [])
    setScanning(false)
    for (const r of res.replays || []) {
      api.replays.getMetadata(r.path).then(meta => {
        setMetadataMap(prev => ({ ...prev, [r.path]: meta }))
      })
    }
  }, [])

  useEffect(() => {
    scan()
    api.store.get('replayAnnotations').then(saved => setAnnotationsMap(saved || {}))
  }, [scan])

  const annoFor = (path) => annotationsMap[path] || { tags: [], notes: '', favorite: false }

  const updateAnnotation = useCallback((path, patch) => {
    setAnnotationsMap(prev => {
      const current = prev[path] || { tags: [], notes: '', favorite: false }
      const next = { ...prev, [path]: { ...current, ...patch } }
      api.store.set('replayAnnotations', next)
      return next
    })
  }, [])

  const allTags = useMemo(() => {
    const set = new Set()
    Object.values(annotationsMap).forEach(a => (a.tags || []).forEach(t => set.add(t)))
    return [...set]
  }, [annotationsMap])

  const rows = useMemo(() => {
    let list = replays.map(r => ({ ...r, meta: metadataMap[r.path], anno: annoFor(r.path) }))

    if (filterTag === 'favorites') list = list.filter(r => r.anno.favorite)
    else if (filterTag !== 'all') list = list.filter(r => r.anno.tags.includes(filterTag))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r => {
        const track = r.meta?.parsed ? r.meta.track.toLowerCase() : ''
        const drivers = r.meta?.parsed ? r.meta.cars.map(c => c.driver.toLowerCase()).join(' ') : ''
        const tags = r.anno.tags.join(' ').toLowerCase()
        return track.includes(q) || drivers.includes(q) || tags.includes(q) || r.filename.toLowerCase().includes(q)
      })
    }

    return [...list].sort((a, b) => {
      if (sortMode === 'track') {
        const at = a.meta?.parsed ? a.meta.track : a.filename
        const bt = b.meta?.parsed ? b.meta.track : b.filename
        return at.localeCompare(bt)
      }
      if (sortMode === 'size') return b.size - a.size
      return new Date(b.mtime) - new Date(a.mtime)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays, metadataMap, annotationsMap, search, filterTag, sortMode])

  const selected = rows.find(r => r.path === selectedPath)

  const openFolder = () => api.replays.openFolder()
  const launch = (p) => api.replays.launch(p)

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: list */}
      <div style={{ width: 380, flexShrink: 0, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <Tooltip text="Filter by track name, driver, filename, or tag">
            <TextInput value={search} onChange={setSearch} placeholder="Search track, driver, tag…" />
          </Tooltip>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
            {[{ id: 'all', label: 'All' }, { id: 'favorites', label: 'Favorites ★' },
              ...allTags.map(t => ({ id: t, label: t }))].map(f => (
              <button key={f.id} onClick={() => setFilterTag(f.id)}
                style={{ fontSize: 11, fontFamily: C.mono, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                  background: filterTag === f.id ? C.yellow : 'transparent',
                  color: filterTag === f.id ? '#000' : C.muted,
                  border: `1px solid ${filterTag === f.id ? C.yellow : C.border}` }}>
                {f.label}
              </button>
            ))}
          </div>
          <Tooltip text="Change the order replays are listed" position="bottom">
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[{ id: 'date', label: 'Date' }, { id: 'track', label: 'Track A-Z' }, { id: 'size', label: 'Size' }].map(s => (
              <button key={s.id} onClick={() => setSortMode(s.id)}
                style={{ fontSize: 10, fontFamily: C.head, fontWeight: 700, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  background: 'none', color: sortMode === s.id ? C.yellow : C.muted,
                  border: `1px solid ${sortMode === s.id ? C.yellowDim : 'transparent'}` }}>
                {s.label}
              </button>
            ))}
          </div>
          </Tooltip>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 16px' }}>
          {!found ? null : scanning ? (
            <>{[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}</>
          ) : rows.length === 0 && replays.length === 0 ? (
            <NoReplaysState onOpenFolder={openFolder} />
          ) : rows.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12, padding: 16, textAlign: 'center' }}>No replays match your filters</div>
          ) : (
            rows.map(r => (
              <ReplayRow key={r.path} replay={r} meta={r.meta} anno={r.anno}
                selected={r.path === selectedPath} onSelect={() => setSelectedPath(r.path)}
                onToggleFavorite={() => updateAnnotation(r.path, { favorite: !r.anno.favorite })} />
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {!found ? (
          <FolderMissingBanner onGoSettings={onGoSettings} />
        ) : selected ? (
          <DetailPanel replay={selected} meta={selected.meta} anno={selected.anno}
            onUpdateAnnotation={(patch) => updateAnnotation(selected.path, patch)}
            onLaunch={launch} onOpenFolder={openFolder} showToast={showToast} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.muted, fontSize: 13 }}>
            Select a replay to see details
          </div>
        )}
      </div>
    </div>
  )
}
