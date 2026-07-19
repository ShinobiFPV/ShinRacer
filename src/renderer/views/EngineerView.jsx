import { useState } from 'react'
import { C, Card, SectionHead, Btn, TextInput } from '../components/primitives'
import { useStore } from '../store/AppStore'
import { useRaceEngineer } from '../hooks/useRaceEngineer'
import { useVoicePtt } from '../hooks/useVoicePtt'

function EmptyState({ onGoSettings }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 40 }}>🧠</div>
      <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 0.5, color: C.textPrimary }}>AI Race Engineer isn't set up</div>
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 360 }}>
        Optional feature — bring your own Claude/OpenAI key, or point it at a local server. Off by default.
      </div>
      <Btn onClick={onGoSettings}>Set up in Settings</Btn>
    </div>
  )
}

// A plain button, not the shared Btn primitive — Btn only exposes onClick,
// but hold-to-talk needs onMouseDown/onMouseUp/onMouseLeave, which Btn
// doesn't forward.
function MicButton({ recording, busy, onPress, onRelease, style: sx = {} }) {
  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={() => { if (recording) onRelease() }}
      disabled={busy}
      title="Hold to talk"
      style={{
        borderRadius: C.radiusMd, fontFamily: C.body, fontWeight: 700, letterSpacing: 1,
        fontSize: 12, padding: '7px 16px', cursor: busy ? 'not-allowed' : 'pointer',
        opacity: busy ? 0.5 : 1, transition: 'background .15s, border-color .15s, color .15s',
        background: recording ? `${C.red}22` : C.raised,
        color: recording ? C.red : C.textSec,
        border: `1px solid ${recording ? C.red : C.border}`,
        ...sx,
      }}>
      {recording ? '● Recording' : busy ? '…' : '🎙'}
    </button>
  )
}

function AlertFeed({ alerts }) {
  const COLOR = { critical: C.red, warning: C.orange, info: C.blue }
  if (!alerts.length) {
    return <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>No alerts yet.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {alerts.map((a, i) => (
        <div key={`${a.id}-${a.ts}-${i}`} style={{ fontSize: 12, color: COLOR[a.severity] || C.textSec,
          borderLeft: `2px solid ${COLOR[a.severity] || C.border}`, paddingLeft: 8 }}>
          {a.message}
        </div>
      ))}
    </div>
  )
}

export default function EngineerView({ onGoSettings }) {
  const { aiEngineer } = useStore()
  const { alerts, messages, sending, sendMessage } = useRaceEngineer()
  const [input, setInput] = useState('')
  const voiceEnabled = !!aiEngineer?.voice?.enabled
  const ptt = useVoicePtt({
    apiKey: aiEngineer?.voice?.deepgramApiKey,
    model: aiEngineer?.voice?.sttModel,
  })

  if (!aiEngineer?.enabled) {
    return <EmptyState onGoSettings={onGoSettings} />
  }

  const send = () => {
    if (!input.trim() || sending) return
    sendMessage(input)
    setInput('')
  }

  // Hold to talk — press starts recording, release stops and transcribes,
  // and (unlike typed messages) auto-sends the transcript immediately, same
  // as imq2's voice turn flow (record -> transcribe -> chat -> speak).
  const releasePtt = async () => {
    const transcript = await ptt.stop()
    if (transcript) sendMessage(transcript)
  }

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', gap: 20 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted }}>Ask about fuel, tyres, gap to best lap, or anything else it can see in your telemetry.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%', background: m.role === 'user' ? C.blue : C.surface,
              color: m.role === 'user' ? '#000000' : C.textPrimary,
              border: m.role === 'user' ? 'none' : `1px solid ${C.border}`,
              borderRadius: C.radiusMd, padding: '8px 12px', fontSize: 13, whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          ))}
          {sending && <div style={{ fontSize: 12, color: C.muted }}>Thinking…</div>}
        </div>
        {ptt.error && <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>{ptt.error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <TextInput value={input} onChange={setInput} placeholder="Ask the race engineer…"
            onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
          {voiceEnabled && (
            <MicButton recording={ptt.recording} busy={ptt.busy} onPress={ptt.start} onRelease={releasePtt} />
          )}
          <Btn onClick={send} disabled={sending || !input.trim()}>Send</Btn>
        </div>
      </div>

      <Card style={{ width: 280, flexShrink: 0, alignSelf: 'flex-start' }}>
        <SectionHead children="Alerts" sub="Fires as toasts too, when Proactive alerts is on" />
        <AlertFeed alerts={alerts} />
      </Card>
    </div>
  )
}
