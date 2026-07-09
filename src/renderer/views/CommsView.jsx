import { useState, useEffect, useRef, useCallback } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Select, Tag, Toggle, OfflineBanner } from '../components/primitives'
import { useStore } from '../store/AppStore'
import { useSocket } from '../hooks/useSocket'
import { useWebRTC } from '../hooks/useWebRTC'

const DEFAULT_PTT_KEY = 'KeyT'
const VOLUME_SAVE_DEBOUNCE_MS = 500

function keyLabel(code) {
  if (!code) return '—'
  return code.replace(/^Key/, '').replace(/^Digit/, '')
}

// ── Mic input level meter (local stream only — not a WebRTC peer) ─────────────
function useLocalAudioLevel(stream) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!stream) { setLevel(0); return }
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      setLevel(Math.min(1, avg / 80))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); source.disconnect(); ctx.close() }
  }, [stream])
  return level
}

function MicMeter({ stream }) {
  const level = useLocalAudioLevel(stream)
  return (
    <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <div style={{ height: '100%', width: `${level * 100}%`,
        background: level > 0.8 ? C.red : level > 0.5 ? C.orange : C.green, transition: 'width .05s' }} />
    </div>
  )
}

function connectionDotColor(state) {
  if (state === 'connected') return C.green
  if (state === 'connecting' || state === 'new' || !state) return C.orange
  return C.red // failed, disconnected, closed
}

function PeerCard({ user, stream, speaking, speakerId, connectionState, onReconnect, volume, onVolumeChange }) {
  const audioRef = useRef(null)

  useEffect(() => { if (audioRef.current) audioRef.current.srcObject = stream || null }, [stream])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])
  useEffect(() => { audioRef.current?.setSinkId?.(speakerId).catch(() => {}) }, [speakerId])

  const isBad = connectionState === 'failed' || connectionState === 'disconnected'

  return (
    <Card accent={speaking ? `${C.green}80` : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <audio ref={audioRef} autoPlay />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: user.color,
          boxShadow: speaking ? `0 0 8px ${user.color}` : 'none',
          animation: speaking ? 'speakPulse 600ms ease-in-out infinite' : 'none' }} />
        <span style={{ fontFamily: C.head, fontWeight: 700, fontSize: 14, flex: 1 }}>{user.handle}</span>
        {speaking && <Tag color={C.green} size="xs">speaking</Tag>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: connectionDotColor(connectionState), flexShrink: 0 }}
          title={connectionState || 'connecting'} />
        <span style={{ fontSize: 10, color: C.muted, textTransform: 'capitalize' }}>{connectionState || 'connecting'}</span>
        {isBad && (
          <Btn size="xs" variant="danger" style={{ marginLeft: 'auto' }} onClick={() => onReconnect(user.id)}>Reconnect</Btn>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12 }}>🔊</span>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => onVolumeChange(+e.target.value)} style={{ flex: 1 }} />
      </div>
    </Card>
  )
}

// ── Voice Panel ────────────────────────────────────────────────────────────────
function VoicePanel({ identity, socket, users, selfId }) {
  const [devices, setDevices] = useState([])
  const [micId, setMicId] = useState('')
  const [speakerId, setSpeakerId] = useState('')
  const [localStream, setLocalStream] = useState(null)
  const [selfMuted, setSelfMuted] = useState(false)
  const [openMic, setOpenMic] = useState(false)
  const [pttActive, setPttActive] = useState(false)
  const [pttKey, setPttKey] = useState(DEFAULT_PTT_KEY)
  const [rebinding, setRebinding] = useState(false)
  const [peerVolumes, setPeerVolumes] = useState({})
  const { showToast } = useStore()
  const volumeSaveRef = useRef(null)

  useEffect(() => {
    window.api.store.get('peerVolumes').then(v => setPeerVolumes(v || {}))
  }, [])

  const setPeerVolume = (handle, vol) => {
    setPeerVolumes(prev => {
      const next = { ...prev, [handle]: vol }
      clearTimeout(volumeSaveRef.current)
      volumeSaveRef.current = setTimeout(() => window.api.store.set('peerVolumes', next), VOLUME_SAVE_DEBOUNCE_MS)
      return next
    })
  }

  // Acquire mic stream, re-acquire on device change. Constraints tuned for voice chat.
  useEffect(() => {
    let cancelled = false
    let stream
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000,
        ...(micId ? { deviceId: { exact: micId } } : {}),
      },
    })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        setLocalStream(s)
      })
      .catch(err => showToast(`✕ Microphone error: ${err.message}`, C.red))
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [micId])

  // Refresh device list — labels only populate once getUserMedia has resolved (permission granted)
  useEffect(() => {
    if (!localStream) return
    navigator.mediaDevices.enumerateDevices().then(setDevices)
  }, [localStream])

  const mics     = devices.filter(d => d.kind === 'audioinput')
  const speakers = devices.filter(d => d.kind === 'audiooutput')

  // Push-to-talk key handling
  useEffect(() => {
    if (openMic) return
    const isTyping = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
    const onKeyDown = (e) => {
      if (rebinding) { e.preventDefault(); setPttKey(e.code); setRebinding(false); return }
      if (isTyping()) return
      if (e.code === pttKey) setPttActive(true)
    }
    const onKeyUp = (e) => {
      if (e.code === pttKey) setPttActive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [pttKey, openMic, rebinding])

  const effectiveMuted = selfMuted || (!openMic && !pttActive)
  const { remoteStreams, speaking, connectionStates, reconnect } = useWebRTC({ socket, presence: users, selfId, localStream, muted: effectiveMuted })

  const peers = users.filter(p => p.id !== selfId)

  return (
    <div style={{ width: 340, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
      <Card>
        <SectionHead children="Devices" />
        <Label muted>Microphone</Label>
        <div style={{ marginBottom: 12 }}>
          <Select value={micId} onChange={setMicId}
            options={[{ value: '', label: 'System default' }, ...mics.map(d => ({ value: d.deviceId, label: d.label || 'Microphone' }))]} />
        </div>
        <Label muted>Speaker</Label>
        <div style={{ marginBottom: 12 }}>
          <Select value={speakerId} onChange={setSpeakerId}
            options={[{ value: '', label: 'System default' }, ...speakers.map(d => ({ value: d.deviceId, label: d.label || 'Speaker' }))]} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Label muted style={{ marginBottom: 0 }}>Input level</Label>
          <span style={{ fontSize: 12, color: pttActive ? C.yellow : C.muted, animation: pttActive ? 'pulse 1s infinite' : 'none' }}>🎙️</span>
        </div>
        <MicMeter stream={effectiveMuted ? null : localStream} />
      </Card>

      <Card>
        <SectionHead children="Transmit mode" />
        <Toggle label="Open mic" value={openMic} onChange={setOpenMic} hint="Off = push-to-talk" />
        {!openMic && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: pttActive ? `${C.green}18` : C.bg, border: `1px solid ${pttActive ? C.green : C.border}`,
            borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
            <div style={{ fontSize: 12, color: C.mutedHi }}>
              Push-to-talk key: <span style={{ fontFamily: C.mono, color: C.yellow }}>{keyLabel(pttKey)}</span>
            </div>
            <Btn size="xs" variant="subtle" onClick={() => setRebinding(true)}>
              {rebinding ? 'Press a key…' : 'Rebind'}
            </Btn>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Btn variant={selfMuted ? 'danger' : 'subtle'} style={{ width: '100%' }} onClick={() => setSelfMuted(m => !m)}>
            {selfMuted ? '🔇 Unmute self' : '🎙️ Mute self'}
          </Btn>
        </div>
      </Card>

      <div>
        <Label muted>On voice ({peers.length})</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {peers.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Nobody else is connected</div>}
          {peers.map(p => (
            <PeerCard key={p.id} user={p} stream={remoteStreams[p.id]} speaking={!!speaking[p.id]} speakerId={speakerId}
              connectionState={connectionStates[p.id]} onReconnect={reconnect}
              volume={peerVolumes[p.handle] ?? 1} onVolumeChange={(v) => setPeerVolume(p.handle, v)} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Text Chat Panel ──────────────────────────────────────────────────────────
function ChatPanel({ identity, socket, quickPhrases }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!socket) return
    const onHistory = (hist) => setMessages(hist.map(m => ({ ...m, kind: 'chat' })))
    const onMsg = (msg) => setMessages(prev => [...prev, { ...msg, kind: 'chat' }])
    const onJoin = (user) => {
      if (user.handle === identity?.handle) return
      setMessages(prev => [...prev, { kind: 'system', id: `sys_${Date.now()}_${user.id}`, text: `${user.handle} joined`, ts: new Date().toISOString() }])
    }
    const onLeave = (user) => {
      setMessages(prev => [...prev, { kind: 'system', id: `sys_${Date.now()}_${user.id}_leave`, text: `${user.handle} left`, ts: new Date().toISOString() }])
    }
    socket.on('chat:history', onHistory)
    socket.on('chat:message', onMsg)
    socket.on('presence:join', onJoin)
    socket.on('presence:leave', onLeave)
    return () => {
      socket.off('chat:history', onHistory)
      socket.off('chat:message', onMsg)
      socket.off('presence:join', onJoin)
      socket.off('presence:leave', onLeave)
    }
  }, [socket, identity?.handle])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = useCallback((text) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || !socket) return
    socket.emit('chat:message', { handle: identity.handle, color: identity.color, text: trimmed })
    setInput('')
  }, [input, socket, identity])

  const fmtTime = (ts) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map(m => m.kind === 'system' ? (
          <div key={m.id} style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', textAlign: 'center' }}>{m.text}</div>
        ) : (
          <div key={m.id} style={{ fontSize: 13 }}>
            <span style={{ fontFamily: C.head, fontWeight: 700, color: m.color || C.yellow }}>{m.handle}</span>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginLeft: 8 }}>{fmtTime(m.ts)}</span>
            <div style={{ color: C.white, marginTop: 2 }}>{m.text}</div>
          </div>
        ))}
        {messages.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>No messages yet — say hi</div>}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {quickPhrases.map(p => (
            <button key={p} onClick={() => send(p)}
              style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, color: C.mutedHi,
                fontSize: 11, padding: '6px 8px', textAlign: 'left', fontFamily: C.body }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.yellow}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              {p}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TextInput value={input} onChange={setInput} placeholder="Message the grid…"
            onKeyDown={e => { if (e.key === 'Enter') send() }} style={{ flex: 1 }} />
          <Btn onClick={() => send()} disabled={!input.trim()}>Send</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Comms Root ────────────────────────────────────────────────────────────────
export default function CommsView() {
  const { identity, quickPhrases, backendUrl, backendOnline, recheckBackend } = useStore()
  const { socket, connected, users } = useSocket(identity)

  if (!identity?.handle) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
        Set your handle in Settings to join comms.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {!backendOnline && (
        <OfflineBanner backendUrl={backendUrl} onRetry={() => { recheckBackend(); socket?.connect() }} />
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <VoicePanel identity={identity} socket={socket} users={users} selfId={socket?.id} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? C.green : C.red }} />
            <span style={{ fontSize: 12, color: C.muted }}>{connected ? `Connected as ${identity.handle}` : 'Connecting…'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{users.length} online</span>
          </div>
          <ChatPanel identity={identity} socket={socket} quickPhrases={quickPhrases} />
        </div>
      </div>
    </div>
  )
}
