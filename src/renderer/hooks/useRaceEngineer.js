import { useCallback, useEffect, useRef, useState } from 'react'
import { useTelemetryShm } from './useTelemetryShm'
import { useStore } from '../store/AppStore'
import { evaluateAlerts } from '../lib/raceEngineerAlerts'
import { C } from '../components/primitives'

const EVAL_INTERVAL_MS = 1000 // don't run the threshold engine every 60fps frame
const ALERT_COOLDOWN_MS = 25000 // re-remind a still-active alert at most this often

const SEVERITY_COLOR = { critical: C.red, warning: C.orange, info: C.blue }

function buildSystemPrompt(handle, voiceOptimized) {
  const who = handle ? `The driver's handle is "${handle}."` : ''
  // Mirrors imq2's personality/builder.py voice_optimized instruction — told
  // to the model, not a post-processing text transform before TTS.
  const voice = voiceOptimized
    ? 'Keep responses voice-optimized — spoken, not written. No bullet lists, headers, or markdown formatting of any kind, since this may be read aloud by text-to-speech. Favor shorter sentences over long written-style paragraphs.'
    : null
  return [
    "You are a race engineer for a sim racer. Be terse, precise, and proactive — speak like a real engineer on a radio: short calls, actionable info, no filler.",
    'Good: "Fuel at 18%, box next lap." Bad: "I notice your fuel level is getting quite low, you might want to consider pitting soon if that\'s possible."',
    who,
    voice,
    'Every message you receive includes one fresh telemetry snapshot appended after the driver\'s question — use only the numbers it actually contains, never invent or estimate a value you were not given. If the snapshot says telemetry is offline, say so briefly instead of guessing.',
    'You have no tools, no memory beyond this conversation, and no connection to any other system — answer from the snapshot and the conversation alone.',
  ].filter(Boolean).join('\n')
}

function formatSnapshot(frame) {
  if (!frame || frame.status === 'OFF') return 'Telemetry offline — no sim detected.'
  const fmt1 = (v, unit = '') => (v == null ? '—' : `${Number(v).toFixed(1)}${unit}`)
  const fmt0 = (v, unit = '') => (v == null ? '—' : `${Number(v).toFixed(0)}${unit}`)
  const lines = [
    `Game: ${frame.gameDisplayName || frame.game || '—'}`,
    `Speed: ${fmt0(frame.speed, ' km/h')}  Gear: ${frame.gear ?? '—'}  RPM: ${fmt0(frame.rpm)}/${fmt0(frame.maxRpm)}`,
    `Fuel: ${frame.fuel == null ? '—' : frame.fuel}${frame.maxFuel ? ` / ${frame.maxFuel}` : ''}`,
    `Lap ${frame.completedLaps ?? '—'}  Pos ${frame.position ?? '—'}  Current: ${frame.currentLapTime || '—'}  Best: ${frame.bestLapTime || '—'}`,
    frame.deltaMs != null ? `Delta vs best: ${frame.deltaMs > 0 ? '+' : ''}${(frame.deltaMs / 1000).toFixed(3)}s` : null,
  ]
  if (Array.isArray(frame.tyreTemp) && frame.tyreTemp.some((t) => t != null)) {
    lines.push(`Tyre temps (C): FL ${fmt0(frame.tyreTemp[0])} FR ${fmt0(frame.tyreTemp[1])} RL ${fmt0(frame.tyreTemp[2])} RR ${fmt0(frame.tyreTemp[3])}`)
  }
  return lines.filter(Boolean).join('\n')
}

// Optional, off-by-default AI race engineer: proactive threshold alerts +
// on-demand chat, driven by the same live telemetry frame every other widget
// in this app uses. Client-side only — see src/main/ai/providers.js for the
// LLM call itself.
export function useRaceEngineer() {
  const { frame, isDemo } = useTelemetryShm()
  const { aiEngineer, identity, showToast } = useStore()
  const [alerts, setAlerts] = useState([]) // recent fired alerts, newest first
  const [messages, setMessages] = useState([]) // [{role, content}]
  const [sending, setSending] = useState(false)
  const lastEvalRef = useRef(0)
  const alertStateRef = useRef({}) // id -> { active, lastFiredAt }
  const audioRef = useRef(null) // currently-playing TTS Audio element, if any

  // Speaks every reply regardless of whether the turn was typed or spoken —
  // same as imq2's run_voice_mode, which always synthesizes the response.
  const speakReply = useCallback(async (text) => {
    const voice = aiEngineer.voice
    if (!voice?.enabled || !voice.deepgramApiKey) return
    const res = await window.api.aiEngineer.speak({
      apiKey: voice.deepgramApiKey, model: voice.ttsModel, text,
    })
    if (!res.ok) return // best-effort — a TTS failure shouldn't break the chat turn
    audioRef.current?.pause()
    const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`)
    audioRef.current = audio
    audio.play().catch(() => {}) // e.g. no output device — non-fatal
  }, [aiEngineer.voice])

  useEffect(() => {
    if (!aiEngineer?.alertsEnabled || isDemo || !frame) return
    const now = Date.now()
    if (now - lastEvalRef.current < EVAL_INTERVAL_MS) return
    lastEvalRef.current = now

    const current = evaluateAlerts(frame)
    const currentIds = new Set(current.map((a) => a.id))
    const state = alertStateRef.current

    for (const alert of current) {
      const prev = state[alert.id]
      const shouldFire = !prev?.active || (now - (prev.lastFiredAt || 0) > ALERT_COOLDOWN_MS)
      if (shouldFire) {
        state[alert.id] = { active: true, lastFiredAt: now }
        showToast(alert.message, SEVERITY_COLOR[alert.severity] || C.blue)
        setAlerts((prevAlerts) => [{ ...alert, ts: now }, ...prevAlerts].slice(0, 20))
      } else {
        state[alert.id] = { ...prev, active: true }
      }
    }
    for (const id of Object.keys(state)) {
      if (!currentIds.has(id)) state[id] = { active: false, lastFiredAt: state[id]?.lastFiredAt }
    }
  }, [frame, isDemo, aiEngineer?.alertsEnabled, showToast])

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim()) return
    const userMsg = { role: 'user', content: text.trim() }
    const snapshot = formatSnapshot(frame)
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setSending(true)
    try {
      const res = await window.api.aiEngineer.chat({
        provider: aiEngineer.provider,
        apiKey: aiEngineer.apiKey,
        model: aiEngineer.model,
        baseUrl: aiEngineer.localBaseUrl,
        systemPrompt: buildSystemPrompt(identity?.handle, aiEngineer.voice?.enabled),
        messages: [
          ...nextHistory.slice(0, -1),
          { role: 'user', content: `${userMsg.content}\n\n[telemetry snapshot]\n${snapshot}` },
        ],
      })
      if (res.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.text }])
        speakReply(res.text)
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `[error] ${res.error}` }])
      }
    } finally {
      setSending(false)
    }
  }, [frame, messages, aiEngineer, identity?.handle, speakReply])

  return { frame, isDemo, alerts, messages, sending, sendMessage }
}
