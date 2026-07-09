import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { C } from '../lib/colors'
import { Btn, StatusTag } from '../components/primitives'
import api, { getBackendUrl } from '../lib/api'
import { getIdentity } from '../lib/auth'
import { STATUS_COLOR, deriveStatus, ProposeForm } from './EventsPage'

function buildIcs(e) {
  const dt = `${e.date.replace(/-/g, '')}T${e.time.replace(':', '')}00`
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ShinRacer//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@shinracer`,
    `DTSTART:${dt}`,
    `SUMMARY:${e.name}`,
    `LOCATION:${e.track}`,
    `DESCRIPTION:${(e.notes || '').replace(/\n/g, '\\n')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const identity = getIdentity()
  const [event, setEvent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  async function load() {
    const { data } = await api.get('/api/events')
    if (data.ok) setEvent(data.data.find(e => e.id === id) || null)
  }
  useEffect(() => { load() }, [id])

  if (!event) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>
        <button onClick={() => navigate(-1)} style={{ fontSize: 20, color: C.textSec, marginBottom: 16 }}>‹ Back</button>
        <div>Loading…</div>
      </div>
    )
  }

  const status = deriveStatus(event)
  const alreadyAccepted = identity?.handle && event.acceptances.includes(identity.handle)
  const isProposer = identity?.handle === event.proposed_by

  async function accept() {
    if (!identity?.handle) return
    setBusy(true)
    try {
      const { data } = await api.patch(`/api/events/${id}/accept`, { handle: identity.handle })
      if (data.ok) setEvent(data.data)
    } finally {
      setBusy(false)
    }
  }

  async function cancelEvent() {
    setBusy(true)
    try {
      const { data } = await api.patch(`/api/events/${id}/cancel`)
      if (data.ok) setEvent(data.data)
    } finally {
      setBusy(false)
    }
  }

  function exportIcs() {
    const blob = new Blob([buildIcs(event)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.name.replace(/[^a-z0-9]/gi, '_')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 24 }}>
      <div style={{ padding: 16 }}>
        <button onClick={() => navigate('/events')} style={{ fontSize: 22, color: C.textSec, minHeight: 44 }}>‹</button>
      </div>

      {event.poster_path && (
        <img src={`${getBackendUrl()}${event.poster_path}`} alt="" style={{ width: '100%', display: 'block', marginBottom: 16 }} />
      )}

      <div style={{ padding: '0 16px' }}>
        <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 1, textDecoration: status === 'cancelled' ? 'line-through' : 'none' }}>{event.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 16px' }}>
          <StatusTag color={STATUS_COLOR[status]}>{status}</StatusTag>
        </div>

        <Detail label="Track" value={event.track} />
        <Detail label="Type" value={event.type} />
        <Detail label="When" value={`${event.date} · ${event.time}`} />
        {event.car_restriction && <Detail label="Cars" value={event.car_restriction} />}
        <Detail label="Proposed by" value={event.proposed_by} />
        {event.acceptances.length > 0 && <Detail label="Going" value={event.acceptances.join(', ')} />}
        {event.notes && <Detail label="Notes" value={event.notes} />}

        {event.required_mods?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Required mods</div>
            {event.required_mods.map((m, i) => (
              <Link key={i} to="/mods" style={{ display: 'block', padding: '8px 0', borderBottom: `1px solid ${C.border}`, color: C.blue, fontSize: 14 }}>{m} →</Link>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {status !== 'cancelled' && status !== 'past' && (
            alreadyAccepted ? (
              <Btn full size="lg" variant="outline" disabled>You're in</Btn>
            ) : (
              <Btn full size="lg" onClick={accept} disabled={busy || !identity?.handle}>
                {identity?.handle ? 'Accept' : 'Sign in to accept'}
              </Btn>
            )
          )}
          <Btn full variant="outline" onClick={exportIcs}>Add to calendar</Btn>

          {isProposer && status !== 'cancelled' && (
            <>
              <Btn full variant="ghost" onClick={() => setShowEdit(true)}>Edit</Btn>
              {!confirmCancel ? (
                <Btn full variant="danger" onClick={() => setConfirmCancel(true)}>Cancel event</Btn>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn full variant="danger" onClick={cancelEvent} disabled={busy}>Confirm cancel</Btn>
                  <Btn full variant="ghost" onClick={() => setConfirmCancel(false)}>Never mind</Btn>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showEdit && (
        <ProposeForm editingEvent={event} onClose={() => setShowEdit(false)} onCreated={(updated) => setEvent(updated)} />
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, color: C.textPrimary }}>{value}</div>
    </div>
  )
}
