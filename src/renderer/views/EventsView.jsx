import { useState, useEffect, useMemo, useCallback } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Select, Tag, OfflineBanner } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { useSocket } from '../hooks/useSocket'
import { ShareModal } from './DeployView'
import api, { getBackendUrl } from '../lib/api'

const EVENT_TYPES = ['Race', 'Drift Session', 'Hotlap Practice', 'Cruise']
const TYPE_COLORS = { 'Race': C.red, 'Drift Session': C.orange, 'Hotlap Practice': C.blue, 'Cruise': C.green }
const STATUS_COLORS = { proposed: C.blue, happening: C.green, past: C.muted, cancelled: C.muted }
const STATUS_LABELS = { proposed: 'Proposed', happening: 'Happening', past: 'Past', cancelled: 'Cancelled' }
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

// Cancelled always wins over the date-derived "past" status.
const displayStatus = (evt, todayIso) => {
  if (evt.status === 'cancelled') return 'cancelled'
  return evt.date < todayIso ? 'past' : evt.status
}

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event'

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function downloadIcs(event) {
  // DTSTART needs YYYYMMDDTHHMMSS (no separators) to be valid — strip the dashes/colon.
  const dt = `${event.date.replace(/-/g, '')}T${event.time.replace(':', '')}00`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AC Companion//EN',
    'BEGIN:VEVENT',
    `DTSTART:${dt}`,
    `SUMMARY:${event.name}`,
    `DESCRIPTION:${event.track} - ${event.type}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
  downloadBlob(ics, 'text/calendar', `${slugify(event.name)}.ics`)
}

// ── Host selector (propose form) ────────────────────────────────────────────
// Constraint: "I'll Host" must be completely hidden from Crew — not
// disabled, not present in the DOM — so `isHost` (host or admin role) gates
// whether Card 2 renders at all, not just whether it's selectable.
function HostSelector({ hostSelection, setHostSelection, selectedHostUid, setSelectedHostUid, onResolvedName, user, isHost }) {
  const [availableHosts, setAvailableHosts] = useState([])
  const [selfStatus, setSelfStatus] = useState(null) // null | { loading, host }

  useEffect(() => {
    api.get('/api/hosts/available').then(({ data }) => { if (data.ok) setAvailableHosts(data.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (hostSelection !== 'self' || !isHost || !user) return
    setSelfStatus({ loading: true })
    api.get(`/api/hosts/${user.uid}/status`)
      .then(({ data }) => setSelfStatus({ loading: false, host: data.ok ? data.data : null }))
      .catch(() => setSelfStatus({ loading: false, host: null }))
  }, [hostSelection, isHost, user])

  // Keeps the parent's "name to submit" in sync without it needing to
  // duplicate the available-hosts fetch or the self-host status check.
  useEffect(() => {
    if (hostSelection === 'self') onResolvedName(user?.name || null)
    else onResolvedName(availableHosts.find(h => h.uid === selectedHostUid)?.name || null)
  }, [hostSelection, selectedHostUid, availableHosts, user, onResolvedName])

  const cardStyle = (active, disabled) => ({
    flex: 1, padding: 16, border: `2px solid ${active ? C.blue : C.border}`, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1, background: active ? `${C.blue}0C` : 'transparent',
  })

  return (
    <div style={{ marginBottom: 16 }}>
      <Label>Who's hosting the game server?</Label>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={cardStyle(hostSelection === 'designated')} onClick={() => setHostSelection('designated')}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>🖥️</div>
          <div style={{ fontFamily: C.head, fontSize: 15, letterSpacing: 0.5 }}>SHINOBI HOSTS</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>William's machine runs the server. You just show up and drive.</div>
        </div>
        {isHost && (
          <div style={cardStyle(hostSelection === 'self')} onClick={() => setHostSelection('self')}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>💻</div>
            <div style={{ fontFamily: C.head, fontSize: 15, letterSpacing: 0.5 }}>I'LL HOST</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>You run the server from your machine. Make sure AC is installed and configured.</div>
          </div>
        )}
      </div>

      {hostSelection === 'designated' && (
        availableHosts.length === 0 ? (
          <div style={{ fontSize: 12, color: C.orange, background: `${C.orange}18`, border: `1px solid ${C.orange}60`, padding: '8px 12px' }}>
            No hosts currently online. The server will be started when the event begins.
          </div>
        ) : (
          <Select value={selectedHostUid || ''} onChange={setSelectedHostUid}
            options={[{ value: '', label: 'Choose a host…' }, ...availableHosts.map(h => ({ value: h.uid, label: `${h.name} (${h.machineName})` }))]} />
        )
      )}

      {hostSelection === 'self' && isHost && (
        selfStatus?.loading ? (
          <div style={{ fontSize: 12, color: C.muted }}>Checking your machine…</div>
        ) : selfStatus?.host ? (
          <div style={{ fontSize: 12, color: C.green, background: `${C.green}18`, border: `1px solid ${C.green}60`, padding: '8px 12px' }}>
            ✓ Your machine is ready to host — {selfStatus.host.machine_name} ({selfStatus.host.ac_path || 'no AC path set'})
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.orange, background: `${C.orange}18`, border: `1px solid ${C.orange}60`, padding: '8px 12px' }}>
            Host setup incomplete — check Settings → Host Status
          </div>
        )
      )}
    </div>
  )
}

// ── Propose / Edit Event Form ─────────────────────────────────────────────────
function ProposeForm({ identity, showToast, onClose, onSaved, initialDate, editingEvent }) {
  const { user, isHost } = useStore()
  const isEditing = !!editingEvent
  const [form, setForm] = useState(() => editingEvent ? {
    name: editingEvent.name, type: editingEvent.type, date: editingEvent.date, time: editingEvent.time,
    track: editingEvent.track, car_restriction: editingEvent.car_restriction || '', notes: editingEvent.notes || '',
  } : { name: '', type: EVENT_TYPES[0], date: initialDate || '', time: '18:00', track: '', car_restriction: '', notes: '' })
  const [mods, setMods] = useState(editingEvent?.required_mods || [])
  const [poster, setPoster] = useState(null)
  const [posterPreview, setPosterPreview] = useState(
    editingEvent?.poster_path ? `${getBackendUrl()}${editingEvent.poster_path}` : null
  )
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hostSelection, setHostSelection] = useState(editingEvent?.host_type || 'designated')
  const [selectedHostUid, setSelectedHostUid] = useState(editingEvent?.host_uid || null)
  const [selectedHostName, setSelectedHostName] = useState(editingEvent?.host_name || null)

  useEffect(() => { if (initialDate && !isEditing) setForm(prev => ({ ...prev, date: initialDate })) }, [initialDate, isEditing])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const addModRow = () => setMods(m => [...m, ''])
  const updateMod = (i, v) => setMods(m => m.map((x, idx) => (idx === i ? v : x)))
  const removeMod = (i) => setMods(m => m.filter((_, idx) => idx !== i))

  const handleFile = (file) => {
    if (!file) return
    setPoster(file)
    setPosterPreview(URL.createObjectURL(file))
  }

  const submit = async () => {
    if (!form.name || !form.date || !form.track || !form.time) { showToast('Name, date, time, and track are required', C.orange); return }
    if (!isEditing && !identity?.handle) { showToast('Set your handle in Settings first', C.orange); return }
    setSubmitting(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (!isEditing) fd.append('proposed_by', identity.handle)
      fd.append('required_mods', JSON.stringify(mods.map(m => m.trim()).filter(Boolean)))
      fd.append('host_type', hostSelection)
      fd.append('host_uid', (hostSelection === 'self' ? user?.uid : selectedHostUid) || '')
      fd.append('host_name', selectedHostName || '')
      if (poster) fd.append('poster', poster)
      const res = isEditing
        ? await api.put(`/api/events/${editingEvent.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await api.post('/api/events', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (res.data.ok) {
        showToast(isEditing ? `✓ Updated "${form.name}"` : `✓ Proposed "${form.name}"`)
        onSaved(res.data.data)
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
      <SectionHead children={isEditing ? 'Edit event' : 'Propose an event'}
        sub={isEditing ? 'Changing date, track, or time resets acceptances' : 'Visible to everyone as soon as you submit'} />
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
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, color: C.textPrimary, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
        </div>
        <div>
          <Label>Time</Label>
          <input type="time" value={form.time} onChange={e => set('time', e.target.value)}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, color: C.textPrimary, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
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
      <HostSelector hostSelection={hostSelection} setHostSelection={setHostSelection}
        selectedHostUid={selectedHostUid} setSelectedHostUid={setSelectedHostUid}
        onResolvedName={setSelectedHostName} user={user} isHost={isHost} />
      <div style={{ marginBottom: 12 }}>
        <Label>Required mods</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {mods.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <TextInput value={m} onChange={v => updateMod(i, v)} placeholder="e.g. Shutoko Revival Project" style={{ flex: 1 }} />
              <Btn size="sm" variant="ghost" onClick={() => removeMod(i)}>✕</Btn>
            </div>
          ))}
        </div>
        <Tooltip text="Add a required mod that players need to download before joining">
          <Btn size="sm" variant="subtle" onClick={addModRow}>+ Add mod</Btn>
        </Tooltip>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>Notes</Label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Meet point, rules, anything else…"
          style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, color: C.textPrimary,
            padding: '8px 10px', fontSize: 12, fontFamily: C.body, outline: 'none', resize: 'vertical' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Label>Poster (optional)</Label>
        <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
          onClick={() => document.getElementById('poster-input').click()}
          style={{ border: `1px dashed ${dragOver ? C.blue : C.border}`, borderRadius: 0, padding: 16, textAlign: 'center',
            cursor: 'pointer', background: dragOver ? `${C.blue}0A` : C.bg }}>
          {posterPreview ? (
            <img src={posterPreview} alt="poster preview" style={{ maxHeight: 120, borderRadius: 0 }} />
          ) : (
            <div style={{ color: C.muted, fontSize: 12 }}>Drop an image here, or click to browse</div>
          )}
        </div>
        <input id="poster-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : (isEditing ? 'Save changes' : 'Propose event')}</Btn>
      </div>
    </Card>
  )
}

// ── Detail Panel ────────────────────────────────────────────────────────────────
function DetailPanel({ event, onClose, onAccept, onEdit, onCancelEvent, onDelete, identity, showToast, liveServers, onGenerateInvite }) {
  const today = isoDate(new Date())
  const status = displayStatus(event, today)
  const hasAccepted = event.acceptances?.includes(identity?.handle)
  const isProposer = event.proposed_by === identity?.handle
  const isCancelled = status === 'cancelled'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hostOnline, setHostOnline] = useState(null) // null = unknown/loading
  const matchedServer = status === 'happening' ? liveServers.find(s => s.config?.trackId === event.track) : null

  useEffect(() => {
    if (!event.host_uid) return
    api.get(`/api/hosts/${event.host_uid}/status`)
      .then(({ data }) => setHostOnline(data.ok ? data.data.is_online : null))
      .catch(() => setHostOnline(null))
  }, [event.host_uid])

  const copyMods = () => {
    navigator.clipboard.writeText(event.required_mods.join('\n'))
    showToast?.('✓ Copied mod list')
  }

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 380, background: C.surface,
      borderLeft: `3px solid ${STATUS_COLORS[status]}`,
      boxShadow: '-8px 0 24px rgba(0,0,0,.4)',
      opacity: status === 'past' ? 0.4 : isCancelled ? 0.5 : 1,
      zIndex: 100, display: 'flex', flexDirection: 'column', animation: 'fadeUp .18s ease' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: C.head, fontSize: 20, textDecoration: isCancelled ? 'line-through' : 'none' }}>{event.name}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Tag color={TYPE_COLORS[event.type] || C.blue}>{event.type}</Tag>
            <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {event.poster_path && (
          <img src={`${getBackendUrl()}${event.poster_path}`} alt="" style={{ width: '100%', borderRadius: 0, marginBottom: 16 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
          <div><Label muted>Track</Label><span style={{ fontFamily: C.mono }}>{event.track}</span></div>
          <div><Label muted>Date & time</Label>{event.date} {event.time}</div>
          {event.host_name && (
            <div>
              <Label muted>Hosted by</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{event.host_type === 'self' ? `${event.host_name}'s machine` : event.host_name}</span>
                {hostOnline != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: hostOnline ? C.green : C.orange }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: hostOnline ? C.green : C.orange }} />
                    {hostOnline ? 'Online' : 'Currently offline'}
                  </span>
                )}
              </div>
            </div>
          )}
          {event.car_restriction && <div><Label muted>Cars</Label>{event.car_restriction}</div>}
          {event.required_mods?.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label muted>Required mods</Label>
                <Tooltip text="Copy the full mod list to clipboard, one per line">
                  <button onClick={copyMods} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 11, cursor: 'pointer', fontFamily: C.mono }}>
                    Copy all
                  </button>
                </Tooltip>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: C.mutedHi, fontSize: 12, lineHeight: 1.8 }}>
                {event.required_mods.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {event.notes && <div><Label muted>Notes</Label><div style={{ color: C.mutedHi }}>{event.notes}</div></div>}
          <div><Label muted>Proposed by</Label>{event.proposed_by}</div>
          <div>
            <Label muted>Accepted ({event.acceptances?.length || 0})</Label>
            {event.acceptances?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {event.acceptances.map(h => <Tag key={h} color={C.green}>{h}</Tag>)}
              </div>
            ) : <div style={{ color: C.muted, fontSize: 12 }}>Nobody yet</div>}
          </div>
        </div>
      </div>
      <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!isCancelled && (
          hasAccepted ? (
            <div style={{ textAlign: 'center', color: C.green, fontFamily: C.head, fontWeight: 700, fontSize: 13 }}>✓ You're in</div>
          ) : (
            <Tooltip text="Confirm you're attending — event becomes Happening when someone else accepts" disabled={!identity?.handle}>
              <Btn style={{ width: '100%' }} onClick={() => onAccept(event.id)} disabled={!identity?.handle}>
                {isProposer ? 'Confirm attendance' : 'Accept'}
              </Btn>
            </Tooltip>
          )
        )}
        {isCancelled && (
          <div style={{ textAlign: 'center', color: C.muted, fontFamily: C.head, fontWeight: 700, fontSize: 13 }}>This event was cancelled</div>
        )}
        {status === 'happening' && (
          matchedServer
            ? (
              <Tooltip text="Create a server join code for this event's track">
                <Btn variant="subtle" style={{ width: '100%' }} onClick={() => onGenerateInvite(matchedServer, event.car_restriction)}>Generate invite</Btn>
              </Tooltip>
            )
            : <div style={{ textAlign: 'center', color: C.muted, fontSize: 12 }}>No live server for this event</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip text="Download a .ics file to add this event to Google Calendar, Outlook, etc." >
            <Btn variant="subtle" size="sm" style={{ flex: 1 }} onClick={() => downloadIcs(event)}>Add to Calendar</Btn>
          </Tooltip>
          <Tooltip text="Change event details — acceptances reset if date, track, or time changes">
            <Btn variant="ghost" size="sm" style={{ flex: 1 }} onClick={() => onEdit(event)}>Edit</Btn>
          </Tooltip>
        </div>
        {!isCancelled && (
          <Tooltip text="Mark this event as cancelled — it stays on the calendar but is crossed out">
            <Btn variant="danger" size="sm" onClick={() => onCancelEvent(event.id)}>Cancel event</Btn>
          </Tooltip>
        )}
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="danger" size="sm" style={{ flex: 1 }} onClick={() => onDelete(event.id)}>Confirm delete</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
          </div>
        ) : (
          <Tooltip text="Permanently remove this event from the calendar">
            <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>Delete event</Btn>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ onPropose }) {
  return (
    <Card style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏁</div>
      <div style={{ fontFamily: C.head, fontSize: 22, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>No events yet</div>
      <div style={{ fontFamily: C.body, color: C.muted, fontSize: 13, marginBottom: 18 }}>Be the first to get something on the calendar.</div>
      <Btn onClick={onPropose}>Propose the first one</Btn>
    </Card>
  )
}

// ── Events Root ──────────────────────────────────────────────────────────────
export default function EventsView() {
  const { identity, showToast, backendUrl, backendOnline, recheckBackend, liveServers } = useStore()
  const { socket } = useSocket(identity)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [prefillDate, setPrefillDate] = useState('')
  const [editingEvent, setEditingEvent] = useState(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [inviteTarget, setInviteTarget] = useState(null) // { server, carRestriction } | null

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

  // Realtime sync when someone else cancels an event.
  useEffect(() => {
    if (!socket) return
    const onCancelled = () => loadEvents()
    socket.on('event:cancelled', onCancelled)
    return () => socket.off('event:cancelled', onCancelled)
  }, [socket, loadEvents])

  // On mount + hourly: notify for events happening within 24h.
  useEffect(() => {
    const checkReminders = async () => {
      try {
        const res = await api.get('/api/events')
        if (!res.data.ok) return
        const now = Date.now()
        const in24h = now + 24 * 60 * 60 * 1000
        const candidates = res.data.data
          .filter(e => e.status === 'happening')
          .filter(e => {
            const t = new Date(`${e.date}T${e.time}`).getTime()
            return t >= now && t <= in24h
          })
          .map(e => ({ id: e.id, name: e.name, time: e.time, date: e.date, track: e.track }))
        if (candidates.length) await window.api.reminders.check(candidates)
      } catch (e) { /* backend unreachable — skip this cycle */ }
    }
    checkReminders()
    const interval = setInterval(checkReminders, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const today = isoDate(new Date())
  const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor])
  const eventsByDate = useMemo(() => {
    const map = {}
    events.forEach(e => { (map[e.date] ||= []).push(e) })
    return map
  }, [events])

  const accept = async (id) => {
    try {
      const res = await api.patch(`/api/events/${id}/accept`, { handle: identity.handle })
      if (res.data.ok) {
        setEvents(prev => prev.map(e => (e.id === id ? res.data.data : e)))
        setSelected(res.data.data)
        showToast('✓ Accepted')
      } else showToast(`✕ ${res.data.error}`, C.red)
    } catch (e) { showToast(`✕ ${e.message}`, C.red) }
  }

  const cancelEvent = async (id) => {
    try {
      const res = await api.patch(`/api/events/${id}/cancel`)
      if (res.data.ok) {
        setEvents(prev => prev.map(e => (e.id === id ? res.data.data : e)))
        setSelected(res.data.data)
        showToast('Event cancelled')
      } else showToast(`✕ ${res.data.error}`, C.red)
    } catch (e) { showToast(`✕ ${e.message}`, C.red) }
  }

  const deleteEvent = async (id) => {
    try {
      // The backend's ownership check (proposer-or-admin) reads this from
      // the request body — axios needs the `data` config key to send a body
      // on a DELETE request, not a bare second argument.
      const res = await api.delete(`/api/events/${id}`, { data: { handle: identity?.handle } })
      if (res.data.ok) {
        setSelected(null)
        setEvents(prev => prev.filter(e => e.id !== id))
        showToast('Event deleted')
        loadEvents()
      } else showToast(`✕ ${res.data.error}`, C.red)
    } catch (e) { showToast(`✕ ${e.message}`, C.red) }
  }

  const clearCalendar = async () => {
    try {
      const res = await api.delete('/api/events/all')
      if (res.data.ok) {
        setEvents([])
        setSelected(null)
        showToast('Calendar cleared')
        loadEvents()
      } else showToast(`✕ ${res.data.error}`, C.red)
    } catch (e) { showToast(`✕ ${e.message}`, C.red) }
    setConfirmClearAll(false)
  }

  const handleSaved = (evt) => {
    setEvents(prev => {
      const exists = prev.some(e => e.id === evt.id)
      return exists ? prev.map(e => (e.id === evt.id ? evt : e)) : [...prev, evt]
    })
    if (editingEvent) setSelected(evt)
    setEditingEvent(null)
  }

  const changeMonth = (delta) => {
    setCursor(prev => {
      let month = prev.month + delta, year = prev.year
      if (month < 0) { month = 11; year-- } else if (month > 11) { month = 0; year++ }
      return { year, month }
    })
  }

  const openProposeForm = (date) => {
    setEditingEvent(null)
    setPrefillDate(date || '')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingEvent(null)
  }

  const openEditForm = (event) => {
    setSelected(null)
    setEditingEvent(event)
    setShowForm(true)
  }

  const onDayClick = (iso, hasEvents) => {
    if (hasEvents || showForm) return
    openProposeForm(iso)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {!backendOnline && <OfflineBanner backendUrl={backendUrl} onRetry={recheckBackend} />}
      <div style={{ padding: '16px 24px 0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tooltip text="Go to previous month">
            <Btn size="sm" variant="subtle" onClick={() => changeMonth(-1)}>←</Btn>
          </Tooltip>
          <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 20, minWidth: 190, textAlign: 'center' }}>
            {MONTH_NAMES[cursor.month]} {cursor.year}
          </div>
          <Tooltip text="Go to next month">
            <Btn size="sm" variant="subtle" onClick={() => changeMonth(1)}>→</Btn>
          </Tooltip>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {confirmClearAll ? (
            <>
              <Btn size="sm" variant="danger" onClick={clearCalendar}>Confirm clear all</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setConfirmClearAll(false)}>Cancel</Btn>
            </>
          ) : (
            events.length > 0 && (
              <Tooltip text="Delete all events — use with caution">
                <Btn size="sm" variant="ghost" style={{ color: C.red }} onClick={() => setConfirmClearAll(true)}>Clear calendar</Btn>
              </Tooltip>
            )
          )}
          <Tooltip text="Schedule a race or drift session for the crew">
            <Btn onClick={() => (showForm ? closeForm() : openProposeForm(''))}>{showForm ? 'Close form' : '+ Propose event'}</Btn>
          </Tooltip>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 24px' }}>
        {showForm && (
          <ProposeForm identity={identity} showToast={showToast} initialDate={prefillDate} editingEvent={editingEvent}
            onClose={closeForm} onSaved={handleSaved} />
        )}

        {loading ? (
          <div style={{ color: C.muted, padding: 20 }}>Loading events…</div>
        ) : events.length === 0 ? (
          <EmptyState onPropose={() => openProposeForm('')} />
        ) : (
          <Card style={{ padding: 0, position: 'relative' }}>
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
                  <div key={i} onClick={() => onDayClick(iso, dayEvents.length > 0)}
                    style={{ minHeight: 96, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                      borderLeft: isToday ? `2px solid ${C.blue}` : '2px solid transparent',
                      padding: 6, opacity: cell.inMonth ? 1 : 0.35,
                      background: 'transparent',
                      cursor: dayEvents.length === 0 && !showForm ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: 10, fontFamily: C.mono, color: isToday ? C.blue : C.muted, marginBottom: 3 }}>{cell.date.getDate()}</div>
                    {dayEvents.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                        {dayEvents.map(e => (
                          <span key={e.id} style={{ width: 4, height: 4, borderRadius: 0, background: STATUS_COLORS[displayStatus(e, today)] }} />
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {dayEvents.map(e => {
                        const status = displayStatus(e, today)
                        return (
                          <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setSelected(e) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.bg, border: `1px solid ${C.border}`,
                              borderRadius: 0, padding: '2px 6px', fontSize: 10, color: C.mutedHi, textAlign: 'left', position: 'relative',
                              opacity: status === 'past' ? 0.4 : status === 'cancelled' ? 0.5 : 1 }}>
                            <span style={{ width: 4, height: 4, borderRadius: 0, background: STATUS_COLORS[status], flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', position: 'relative', textOverflow: 'ellipsis',
                              textDecoration: status === 'cancelled' ? 'line-through' : 'none' }}>{e.name}</span>
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

      {selected && (
        <DetailPanel event={selected} onClose={() => setSelected(null)} onAccept={accept} onEdit={openEditForm}
          onCancelEvent={cancelEvent} onDelete={deleteEvent} identity={identity} showToast={showToast}
          liveServers={liveServers} onGenerateInvite={(server, carRestriction) => setInviteTarget({ server, carRestriction })} />
      )}

      {inviteTarget && (
        <ShareModal server={inviteTarget.server} identity={identity} carRestriction={inviteTarget.carRestriction}
          onClose={() => setInviteTarget(null)} showToast={showToast} />
      )}
    </div>
  )
}
