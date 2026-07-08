import { useState, useEffect, useMemo, useCallback } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Select, Tag } from '../components/primitives'
import { useStore } from '../store/AppStore'
import api, { getBackendUrl } from '../lib/api'

const EVENT_TYPES = ['Race', 'Drift Session', 'Hotlap Practice', 'Cruise']
const TYPE_COLORS = { 'Race': C.red, 'Drift Session': C.purple, 'Hotlap Practice': C.blue, 'Cruise': C.green }
const STATUS_COLORS = { proposed: C.orange, happening: C.green, past: C.muted }
const STATUS_LABELS = { proposed: 'Proposed', happening: 'Happening', past: 'Past' }
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const pad = n => String(n).padStart(2, '0')
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = startWeekday - 1; i >= 0; i--) cells.push({ date: new Date(year, month, -i), inMonth: false })
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: new Date(year, month, day), inMonth: true })
  while (cells.length % 7 !== 0) {
    const d = new Date(cells[cells.length - 1].date)
    d.setDate(d.getDate() + 1)
    cells.push({ date: d, inMonth: false })
  }
  return cells
}

const displayStatus = (evt, todayIso) => (evt.date < todayIso ? 'past' : evt.status)

// ── Propose Event Form ─────────────────────────────────────────────────────────
function ProposeForm({ identity, showToast, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', type: EVENT_TYPES[0], date: '', time: '', track: '', car_restriction: '', notes: '' })
  const [mods, setMods] = useState([])
  const [modInput, setModInput] = useState('')
  const [poster, setPoster] = useState(null)
  const [posterPreview, setPosterPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const addMod = () => { if (modInput.trim()) { setMods(m => [...m, modInput.trim()]); setModInput('') } }
  const removeMod = (i) => setMods(m => m.filter((_, idx) => idx !== i))

  const handleFile = (file) => {
    if (!file) return
    setPoster(file)
    setPosterPreview(URL.createObjectURL(file))
  }

  const submit = async () => {
    if (!form.name || !form.date || !form.track) { showToast('Name, date, and track are required', C.orange); return }
    if (!identity?.handle) { showToast('Set your handle in Settings first', C.orange); return }
    setSubmitting(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      fd.append('proposed_by', identity.handle)
      fd.append('required_mods', JSON.stringify(mods))
      if (poster) fd.append('poster', poster)
      const res = await api.post('/api/events', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (res.data.ok) {
        showToast(`✓ Proposed "${form.name}"`)
        onCreated(res.data.data)
        onClose()
      } else {
        showToast(`✕ ${res.data.error}`, C.red)
      }
    } catch (e) {
      showToast(`✕ ${e.message}`, C.red)
    }
    setSubmitting(false)
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionHead children="Propose an event" sub="Visible to everyone as soon as you submit" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <Label>Event name</Label>
          <TextInput value={form.name} onChange={v => set('name', v)} placeholder="Midnight Touge Run" />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.type} onChange={v => set('type', v)} options={EVENT_TYPES} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
        <div>
          <Label>Date</Label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.white, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
        </div>
        <div>
          <Label>Time</Label>
          <input type="time" value={form.time} onChange={e => set('time', e.target.value)}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.white, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
        </div>
        <div>
          <Label>Track</Label>
          <TextInput value={form.track} onChange={v => set('track', v)} placeholder="shuto_revival_project_beta" mono />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>Car class / restriction</Label>
        <TextInput value={form.car_restriction} onChange={v => set('car_restriction', v)} placeholder="Free for all / JDM only / GT3 only…" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>Required mods</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <TextInput value={modInput} onChange={setModInput} placeholder="e.g. Shutoko Revival Project"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMod() } }} />
          <Btn size="sm" variant="subtle" onClick={addMod}>Add</Btn>
        </div>
        {mods.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mods.map((m, i) => (
              <button key={i} onClick={() => removeMod(i)} style={{ background: C.raised, border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', fontFamily: C.mono }}>
                {m} ✕
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>Notes</Label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Meet point, rules, anything else…"
          style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.white,
            padding: '8px 10px', fontSize: 12, fontFamily: C.body, outline: 'none', resize: 'vertical' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Label>Poster (optional)</Label>
        <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
          onClick={() => document.getElementById('poster-input').click()}
          style={{ border: `1px dashed ${dragOver ? C.yellow : C.border}`, borderRadius: 7, padding: 16, textAlign: 'center',
            cursor: 'pointer', background: dragOver ? `${C.yellow}0A` : C.bg }}>
          {posterPreview ? (
            <img src={posterPreview} alt="poster preview" style={{ maxHeight: 120, borderRadius: 5 }} />
          ) : (
            <div style={{ color: C.muted, fontSize: 12 }}>Drop an image here, or click to browse</div>
          )}
        </div>
        <input id="poster-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Propose event'}</Btn>
      </div>
    </Card>
  )
}

// ── Detail Panel ────────────────────────────────────────────────────────────────
function DetailPanel({ event, onClose, onAccept, identity }) {
  const today = isoDate(new Date())
  const status = displayStatus(event, today)
  const hasAccepted = event.acceptances?.some(a => a.handle === identity?.handle)
  const isProposer = event.proposed_by === identity?.handle

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: C.surface,
      borderLeft: `1px solid ${C.border}`, boxShadow: '-8px 0 24px rgba(0,0,0,.4)', zIndex: 100,
      display: 'flex', flexDirection: 'column', animation: 'fadeUp .18s ease' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 18 }}>{event.name}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Tag color={TYPE_COLORS[event.type] || C.blue}>{event.type}</Tag>
            <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {event.poster_path && (
          <img src={`${getBackendUrl()}${event.poster_path}`} alt="" style={{ width: '100%', borderRadius: 7, marginBottom: 16 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
          <div><Label muted>Track</Label><span style={{ fontFamily: C.mono }}>{event.track}</span></div>
          <div><Label muted>Date & time</Label>{event.date} {event.time}</div>
          {event.car_restriction && <div><Label muted>Cars</Label>{event.car_restriction}</div>}
          {event.required_mods?.length > 0 && (
            <div>
              <Label muted>Required mods</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {event.required_mods.map((m, i) => <Tag key={i} color={C.muted}>{m}</Tag>)}
              </div>
            </div>
          )}
          {event.notes && <div><Label muted>Notes</Label><div style={{ color: C.mutedHi }}>{event.notes}</div></div>}
          <div><Label muted>Proposed by</Label>{event.proposed_by}</div>
          <div>
            <Label muted>Accepted ({event.acceptances?.length || 0})</Label>
            {event.acceptances?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {event.acceptances.map(a => <Tag key={a.handle} color={C.green}>{a.handle}</Tag>)}
              </div>
            ) : <div style={{ color: C.muted, fontSize: 12 }}>Nobody yet</div>}
          </div>
        </div>
      </div>
      <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
        {!hasAccepted ? (
          <Btn style={{ width: '100%' }} onClick={() => onAccept(event.id)} disabled={!identity?.handle}>
            {isProposer ? 'Confirm attendance' : 'Accept'}
          </Btn>
        ) : (
          <div style={{ textAlign: 'center', color: C.green, fontFamily: C.head, fontWeight: 700, fontSize: 13 }}>✓ You're in</div>
        )}
      </div>
    </div>
  )
}

// ── Events Root ──────────────────────────────────────────────────────────────
export default function EventsView() {
  const { identity, showToast } = useStore()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/events')
      if (res.data.ok) setEvents(res.data.data)
    } catch (e) {
      showToast(`✕ Could not reach backend: ${e.message}`, C.red)
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => { loadEvents() }, [loadEvents])

  const today = isoDate(new Date())
  const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor])
  const eventsByDate = useMemo(() => {
    const map = {}
    events.forEach(e => { (map[e.date] ||= []).push(e) })
    return map
  }, [events])

  const accept = async (id) => {
    try {
      const res = await api.patch(`/api/events/${id}`, { handle: identity.handle })
      if (res.data.ok) {
        setEvents(prev => prev.map(e => (e.id === id ? res.data.data : e)))
        setSelected(res.data.data)
        showToast('✓ Accepted')
      } else showToast(`✕ ${res.data.error}`, C.red)
    } catch (e) { showToast(`✕ ${e.message}`, C.red) }
  }

  const changeMonth = (delta) => {
    setCursor(prev => {
      let month = prev.month + delta, year = prev.year
      if (month < 0) { month = 11; year-- } else if (month > 11) { month = 0; year++ }
      return { year, month }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px 0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn size="sm" variant="subtle" onClick={() => changeMonth(-1)}>←</Btn>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 20, minWidth: 190, textAlign: 'center' }}>
            {MONTH_NAMES[cursor.month]} {cursor.year}
          </div>
          <Btn size="sm" variant="subtle" onClick={() => changeMonth(1)}>→</Btn>
        </div>
        <Btn onClick={() => setShowForm(s => !s)}>{showForm ? 'Close form' : '+ Propose event'}</Btn>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 24px' }}>
        {showForm && (
          <ProposeForm identity={identity} showToast={showToast} onClose={() => setShowForm(false)}
            onCreated={(evt) => setEvents(prev => [...prev, evt])} />
        )}

        {loading ? (
          <div style={{ color: C.muted, padding: 20 }}>Loading events…</div>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: `1px solid ${C.border}` }}>
              {WEEKDAYS.map(w => (
                <div key={w} style={{ padding: '8px 10px', fontFamily: C.head, fontWeight: 700, fontSize: 11, color: C.muted, textAlign: 'center' }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {grid.map((cell, i) => {
                const iso = isoDate(cell.date)
                const dayEvents = eventsByDate[iso] || []
                const isToday = iso === today
                return (
                  <div key={i} style={{ minHeight: 96, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                    padding: 6, opacity: cell.inMonth ? 1 : 0.35, background: isToday ? `${C.yellow}0A` : 'transparent' }}>
                    <div style={{ fontSize: 11, fontFamily: C.mono, color: isToday ? C.yellow : C.muted, marginBottom: 4 }}>{cell.date.getDate()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {dayEvents.map(e => {
                        const status = displayStatus(e, today)
                        return (
                          <button key={e.id} onClick={() => setSelected(e)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.bg, border: `1px solid ${C.border}`,
                              borderRadius: 3, padding: '2px 6px', fontSize: 10, color: C.mutedHi, textAlign: 'left', overflow: 'hidden' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[e.type] || C.blue, flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                            {status === 'happening' && <span style={{ marginLeft: 'auto', color: C.green }}>●</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      {selected && <DetailPanel event={selected} onClose={() => setSelected(null)} onAccept={accept} identity={identity} />}
    </div>
  )
}
