import { useEffect, useRef, useState } from 'react'
import { C } from '../lib/colors'
import { Btn, Card, Chip, PageTitle, EmptyState } from '../components/primitives'
import { getIdentity } from '../lib/auth'
import { useSocket } from '../hooks/useSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import { formatTime } from '../lib/format'

const QUICK_PHRASES = [
  'Returning to pits', "I've wrecked, I'm out", 'Yellow flag, slow down',
  'Good race everyone', 'Ready when you are', 'Give me 2 mins', 'On my way to grid', 'GG',
]

function VoiceTab({ identity, socket, connected, users }) {
  const [muted, setMuted] = useState(true)
  const [ptt, setPtt] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [devices, setDevices] = useState([])
  const [volumes, setVolumes] = useState({})
  const audioElsRef = useRef({})

  const selfId = socket?.id
  const presence = users.map(u => ({ id: u.id, handle: u.handle, color: u.color }))
  const effectiveMuted = ptt ? false : muted
  const { remoteStreams, speaking, connectionStates, reconnect } = useWebRTC({
    socket, presence, selfId, localStream, muted: effectiveMuted,
  })

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
    }).then(setLocalStream).catch(() => {})
    navigator.mediaDevices?.enumerateDevices().then(list => {
      const withLabels = list.filter(d => d.kind === 'audioinput' && d.label)
      setDevices(withLabels)
    }).catch(() => {})
    return () => localStream?.getTracks().forEach(t => t.stop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      let el = audioElsRef.current[peerId]
      if (!el) { el = new Audio(); el.autoplay = true; audioElsRef.current[peerId] = el }
      el.srcObject = stream
      el.volume = (volumes[peerId] ?? 100) / 100
    })
  }, [remoteStreams, volumes])

  const holdStart = (e) => { e.preventDefault(); setPtt(true) }
  const holdEnd = (e) => { e.preventDefault(); setPtt(false) }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card accent={identity.color} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: identity.color, borderRadius: '50%' }} />
          <div style={{ fontFamily: C.head, fontSize: 16 }}>{identity.handle}</div>
          <span style={{ fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, padding: '2px 6px' }}>YOU</span>
        </div>
        <Btn full size="lg" variant={muted ? 'outline' : 'primary'} onClick={() => setMuted(m => !m)}>
          {muted ? '🔇 Mic off' : '🎙️ Mic on'}
        </Btn>
        {!connected && <div style={{ fontSize: 12, color: C.orange }}>Connecting to the crew…</div>}
      </Card>

      {devices.length > 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>Mic: {devices[0].label}</div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>Using your device's default mic.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {presence.filter(p => p.id !== selfId).length === 0 && (
          <EmptyState emoji="🎙️" title="Nobody else here yet" subtitle="Comms lights up when the crew joins." />
        )}
        {presence.filter(p => p.id !== selfId).map(p => (
          <Card key={p.id} style={{
            borderLeft: `3px solid ${p.color}`,
            boxShadow: speaking[p.id] ? `0 0 0 1px ${p.color}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color }} />
              <div style={{ fontFamily: C.head, fontSize: 15, flex: 1 }}>{p.handle}</div>
              <span style={{ fontSize: 10, color: connectionStates[p.id] === 'connected' ? C.green : C.orange }}>
                {connectionStates[p.id] || 'connecting'}
              </span>
            </div>
            {(connectionStates[p.id] === 'failed' || connectionStates[p.id] === 'disconnected') && (
              <Btn size="sm" variant="outline" onClick={() => reconnect(p.id)} style={{ marginBottom: 8 }}>Reconnect</Btn>
            )}
            <input type="range" min="0" max="100" value={volumes[p.id] ?? 100}
              onChange={e => setVolumes(v => ({ ...v, [p.id]: Number(e.target.value) }))}
              style={{ width: '100%' }} />
          </Card>
        ))}
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(76px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Hold to talk</div>
        <button
          onTouchStart={holdStart} onTouchEnd={holdEnd} onTouchCancel={holdEnd}
          onMouseDown={holdStart} onMouseUp={holdEnd} onMouseLeave={holdEnd}
          style={{
            pointerEvents: 'auto', width: 80, height: 80, borderRadius: '50%',
            background: ptt ? C.blue : 'transparent', border: `2px solid ${ptt ? C.blue : C.border}`,
            color: ptt ? C.whiteHot : C.textSec, fontSize: 24,
          }}
        >🎙️</button>
      </div>
    </div>
  )
}

function ChatTab({ identity, socket }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!socket) return
    const onHistory = (list) => setMessages(list)
    const onMessage = (msg) => setMessages(m => [...m, msg])
    socket.on('chat:history', onHistory)
    socket.on('chat:message', onMessage)
    return () => { socket.off('chat:history', onHistory); socket.off('chat:message', onMessage) }
  }, [socket])

  useEffect(() => { scrollRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

  function send(value) {
    const body = (value ?? text).trim()
    if (!body || !socket) return
    socket.emit('chat:message', { handle: identity.handle, color: identity.color, text: body })
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        {messages.length === 0 && <EmptyState emoji="💬" title="No messages yet" subtitle="Say hi." />}
        {messages.map(m => (
          <div key={m.id} style={{ borderLeft: `2px solid ${m.color}`, padding: '6px 10px', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontFamily: C.head, fontSize: 13, color: m.color }}>{m.handle}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{formatTime(m.ts)}</span>
            </div>
            <div style={{ fontSize: 14 }}>{m.text}</div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 16px' }}>
        {QUICK_PHRASES.map(p => <Chip key={p} onClick={() => send(p)}>{p}</Chip>)}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '8px 16px calc(8px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C.border}` }}>
        <input
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Message the crew…"
          style={{ flex: 1, minHeight: 44, background: C.raised, border: `1px solid ${C.border}`, color: C.textPrimary, fontFamily: C.body, fontSize: 15, padding: '0 12px' }}
        />
        <Btn onClick={() => send()}>Send</Btn>
      </div>
    </div>
  )
}

export default function CommsPage() {
  const identity = getIdentity()
  const [tab, setTab] = useState('voice')
  const { socket, connected, users } = useSocket(identity)

  if (!identity?.handle) {
    return (
      <div style={{ padding: 24 }}>
        <PageTitle style={{ marginBottom: 16 }}>Comms</PageTitle>
        <EmptyState emoji="🔒" title="Sign in to join comms" subtitle="Voice and chat need an identity — guests get view-only access." />
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <PageTitle>Comms</PageTitle>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Chip active={tab === 'voice'} onClick={() => setTab('voice')}>Voice</Chip>
          <Chip active={tab === 'chat'} onClick={() => setTab('chat')}>Chat</Chip>
        </div>
      </div>
      {tab === 'voice'
        ? <VoiceTab identity={identity} socket={socket} connected={connected} users={users} />
        : <ChatTab identity={identity} socket={socket} />}
    </div>
  )
}
