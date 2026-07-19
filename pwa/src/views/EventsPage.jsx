import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/colors'
import { Btn, Card, Label, TextInput, PageTitle, StatusTag, BottomSheet, EmptyState, OfflineBanner } from '../components/primitives'
import api from '../lib/api'
import { getIdentity } from '../lib/auth'
import { useBackend } from '../hooks/useBackend'

export const STATUS_COLOR = { proposed: C.blue, happening: C.green, past: C.muted, cancelled: C.muted }
const TYPES = ['Race', 'Drift Session', 'Hotlap Practice', 'Cruise']
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

export function deriveStatus(e) {
  if (e.status === 'cancelled') return 'cancelled'
  if (e.status === 'happening') {
    return new Date(`${e.date}T${e.time || '00:00'}`).getTime() < Date.now() ? 'past' : 'happening'
  }
  return e.status
}

export function ProposeForm({ onClose, onCreated, editingEvent }) {
  const identity = getIdentity()
  const [form, setForm] = useState(editingEvent
    ? { name: editingEvent.name, type: editingEvent.type, date: editingEvent.date, time: editingEvent.time, track: editingEvent.track, car_restriction: editingEvent.car_restriction || '', notes: editingEvent.notes || '' }
    : { name: '', type: 'Race', date: '', time: '', track: '', car_restriction: '', notes: '' })
  const [mods, setMods] = useState(editingEvent?.required_mods || [])
  const [modInput, setModInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  async function submit() {
    if (!identity?.handle) { setError(`Sign in first — ${editingEvent ? 'editing' : 'proposing'} an event needs an identity.`); return }
    if (!form.name || !form.date || !form.time || !form.track) { setError('Name, date, time, and track are required.'); return }
    setSaving(true)
    setError(null)
    try {
      const body = new FormData()
      Object.entries(form).forEach(([k, v]) => body.append(k, v))
      body.append('required_mods', JSON.stringify(mods))
      let data
      if (editingEvent) {
        ;({ data } = await api.put(`/api/events/${editingEvent.id}`, body))
      } else {
        body.append('proposed_by', identity.handle)
        ;({ data } = await api.post('/api/events', body))
      }
      if (!data.ok) throw new Error(data.error)
      onCreated(data.data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={editingEvent ? 'Edit event' : 'Propose event'}>
      <Label>Name</Label>
      <TextInput value={form.name} onChange={set('name')} placeholder="Shutoko cruise" style={{ marginBottom: 12 }} />

      <Label>Type</Label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TYPES.map(t => (
          <button key={t} onClick={() => set('type')(t)} style={{
            minHeight: 40, padding: '0 14px', background: form.type === t ? C.blue : 'transparent',
            color: form.type === t ? C.whiteHot : C.textSec, border: `1px solid ${form.type === t ? C.blue : C.border}`,
            fontSize: 13,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <Label>Date</Label>
          <TextInput type="date" value={form.date} onChange={set('date')} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Time</Label>
          <TextInput type="time" value={form.time} onChange={set('time')} />
        </div>
      </div>

      <Label>Track</Label>
      <TextInput value={form.track} onChange={set('track')} placeholder="Shutoko Revival Project" style={{ marginBottom: 12 }} />

      <Label>Car restriction (optional)</Label>
      <TextInput value={form.car_restriction} onChange={set('car_restriction')} placeholder="Any JDM" style={{ marginBottom: 12 }} />

      <Label>Required mods</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <TextInput value={modInput} onChange={setModInput} placeholder="Add a mod" />
        <Btn size="sm" variant="outline" onClick={() => { if (modInput) { setMods(m => [...m, modInput]); setModInput('') } }}>Add</Btn>
      </div>
      {mods.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {mods.map((m, i) => (
            <span key={i} onClick={() => setMods(ms => ms.filter((_, idx) => idx !== i))} style={{ fontSize: 12, color: C.textSec, border: `1px solid ${C.border}`, padding: '3px 8px' }}>{m} ✕</span>
          ))}
        </div>
      )}

      <Label>Notes</Label>
      <textarea value={form.notes} onChange={e => set('notes')(e.target.value)} rows={3}
        style={{ width: '100%', background: C.raised, border: `1px solid ${C.border}`, color: C.textPrimary, fontFamily: C.body, fontSize: 15, padding: 10, marginBottom: 16 }} />

      {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <Btn full size="lg" onClick={submit} disabled={saving}>
        {saving ? 'Saving…' : editingEvent ? 'Save changes' : 'Post event'}
      </Btn>
    </BottomSheet>
  )
}

export default function EventsPage() {
  const navigate = useNavigate()
  const { isOnline } = useBackend()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const [showPropose, setShowPropose] = useState(false)

  const cursor = new Date()
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + monthOffset)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/api/events')
      if (data.ok) setEvents(data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const monthEvents = events
    .filter(e => {
      const d = new Date(`${e.date}T00:00`)
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()
    })
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PageTitle>Events</PageTitle>
        <Btn size="sm" onClick={() => setShowPropose(true)}>+ Propose</Btn>
      </div>

      <OfflineBanner show={isOnline === false} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 16px 16px' }}>
        <button onClick={() => setMonthOffset(o => o - 1)} style={{ fontSize: 20, minWidth: 44, minHeight: 44, color: C.textSec }}>‹</button>
        <div style={{ fontFamily: C.head, fontSize: 16, letterSpacing: 2, color: C.textSec, minWidth: 160, textAlign: 'center' }}>
          {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
        </div>
        <button onClick={() => setMonthOffset(o => o + 1)} style={{ fontSize: 20, minWidth: 44, minHeight: 44, color: C.textSec }}>›</button>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div style={{ color: C.muted, textAlign: 'center', padding: 24 }}>Loading…</div>}
        {!loading && monthEvents.length === 0 && (
          <EmptyState emoji="🏁" title="Nothing on the calendar" subtitle="Propose the next one." />
        )}
        {monthEvents.map(e => {
          const status = deriveStatus(e)
          const d = new Date(`${e.date}T00:00`)
          return (
            <Card key={e.id} accent={STATUS_COLOR[status]} onClick={() => navigate(`/events/${e.id}`)} style={{ display: 'flex', gap: 14, opacity: status === 'past' || status === 'cancelled' ? 0.6 : 1 }}>
              <div style={{ minWidth: 44, textAlign: 'center' }}>
                <div style={{ fontFamily: C.head, fontSize: 32, lineHeight: 1 }}>{d.getDate()}</div>
                <div style={{ fontFamily: C.body, fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{MONTH_NAMES[d.getMonth()].slice(0, 3)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 0.5, textDecoration: status === 'cancelled' ? 'line-through' : 'none' }}>{e.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{e.track} · {e.type}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <StatusTag color={STATUS_COLOR[status]}>{status}</StatusTag>
                  {status === 'happening' && <span style={{ fontSize: 12, color: C.green }}>{e.acceptances.length} going</span>}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {showPropose && <ProposeForm onClose={() => setShowPropose(false)} onCreated={() => load()} />}
    </div>
  )
}
