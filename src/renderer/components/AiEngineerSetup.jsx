import { useState } from 'react'
import { C, Label, TextInput, Select, Toggle, Btn, Divider } from './primitives'

const PROVIDER_OPTIONS = [
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'local', label: 'Local (Ollama / LM Studio / OpenAI-compatible)' },
]

const MODEL_PLACEHOLDER = {
  claude: 'claude-opus-4-8',
  openai: 'gpt-4o-mini',
  local: 'e.g. llama3 — whatever model is loaded on your server',
}

const INSTRUCTIONS = {
  claude: 'Get an API key at console.anthropic.com/settings/keys, then paste it below.',
  openai: 'Get an API key at platform.openai.com/api-keys, then paste it below.',
  local: 'Point this at any OpenAI-compatible local server — e.g. Ollama (http://localhost:11434/v1) or LM Studio (http://localhost:1234/v1). An API key is usually not required.',
}

// Shared form for both SettingsView's "AI Race Engineer" section and the
// optional Wizard step. Purely controlled — value/onChange only, no store
// access of its own — so each caller decides whether onChange instant-saves
// (Settings) or just updates local step state until the Wizard finishes.
export default function AiEngineerSetup({ value, onChange }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // null | { ok, error? }
  const [voiceTesting, setVoiceTesting] = useState(false)
  const [voiceTestResult, setVoiceTestResult] = useState(null) // null | { ok, error? }

  const set = (patch) => onChange({ ...patch })
  const setVoice = (patch) => set({ voice: { ...value.voice, ...patch } })

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const res = await window.api.aiEngineer.chat({
      provider: value.provider,
      apiKey: value.apiKey,
      model: value.model,
      baseUrl: value.localBaseUrl,
      systemPrompt: 'Reply with the single word OK.',
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    })
    setTestResult(res.ok ? { ok: true } : { ok: false, error: res.error })
    setTesting(false)
  }

  const testVoice = async () => {
    setVoiceTesting(true)
    setVoiceTestResult(null)
    const res = await window.api.aiEngineer.speak({
      apiKey: value.voice.deepgramApiKey,
      model: value.voice.ttsModel,
      text: 'Voice test. Systems nominal.',
    })
    if (res.ok) {
      new Audio(`data:${res.mimeType};base64,${res.audioBase64}`).play().catch(() => {})
      setVoiceTestResult({ ok: true })
    } else {
      setVoiceTestResult({ ok: false, error: res.error })
    }
    setVoiceTesting(false)
  }

  return (
    <div>
      <Toggle
        label="Enable AI Race Engineer"
        hint="Off by default. Uses your own API key or a local server — never reaches ShinTech's servers or any other ShinTech app."
        value={!!value.enabled}
        onChange={(v) => set({ enabled: v })}
      />

      {value.enabled && (
        <>
          <div style={{ marginTop: 14 }}>
            <Label>Provider</Label>
            <Select value={value.provider} onChange={(v) => { set({ provider: v }); setTestResult(null) }} options={PROVIDER_OPTIONS} style={{ maxWidth: 340 }} />
          </div>

          <div style={{ fontSize: 11, color: C.muted, marginTop: 8, maxWidth: 460, lineHeight: 1.6 }}>
            {INSTRUCTIONS[value.provider]}
          </div>

          {value.provider !== 'local' && (
            <div style={{ marginTop: 14, maxWidth: 460 }}>
              <Label>API key</Label>
              <TextInput mono value={value.apiKey} onChange={(v) => { set({ apiKey: v }); setTestResult(null) }} placeholder="sk-…" />
            </div>
          )}

          {value.provider === 'local' && (
            <>
              <div style={{ marginTop: 14, maxWidth: 460 }}>
                <Label>Server URL</Label>
                <TextInput mono value={value.localBaseUrl} onChange={(v) => { set({ localBaseUrl: v }); setTestResult(null) }} placeholder="http://localhost:11434/v1" />
              </div>
              <div style={{ marginTop: 14, maxWidth: 460 }}>
                <Label muted>API key (optional)</Label>
                <TextInput mono value={value.apiKey} onChange={(v) => { set({ apiKey: v }); setTestResult(null) }} placeholder="leave blank if your server doesn't need one" />
              </div>
            </>
          )}

          <div style={{ marginTop: 14, maxWidth: 460 }}>
            <Label>Model</Label>
            <TextInput mono value={value.model} onChange={(v) => { set({ model: v }); setTestResult(null) }} placeholder={MODEL_PLACEHOLDER[value.provider]} />
          </div>

          <div style={{ marginTop: 16 }}>
            <Toggle
              label="Proactive alerts"
              hint="Toast when fuel/tyres/damage cross a threshold — off just answers questions on demand"
              value={!!value.alertsEnabled}
              onChange={(v) => set({ alertsEnabled: v })}
            />
          </div>

          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Btn size="sm" variant="subtle" onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Btn>
            {testResult && (
              testResult.ok
                ? <span style={{ fontSize: 12, color: C.green }}>✓ Connected</span>
                : <span style={{ fontSize: 12, color: C.red }}>✗ {testResult.error}</span>
            )}
          </div>

          <Divider />

          <Toggle
            label="Voice (push-to-talk)"
            hint="Hold a mic button to talk, replies are spoken back. No wake word — every turn is an explicit hold-to-talk."
            value={!!value.voice?.enabled}
            onChange={(v) => setVoice({ enabled: v })}
          />

          {value.voice?.enabled && (
            <>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, marginBottom: 12, maxWidth: 460, lineHeight: 1.6 }}>
                Powered by Deepgram — one key does both speech-to-text and text-to-speech. Get a free API key at
                console.deepgram.com/signup, then paste it below. This key is separate from your LLM key above and,
                like it, is only ever used to talk directly to Deepgram — never sent anywhere else.
              </div>

              <div style={{ maxWidth: 460 }}>
                <Label>Deepgram API key</Label>
                <TextInput mono value={value.voice.deepgramApiKey} onChange={(v) => { setVoice({ deepgramApiKey: v }); setVoiceTestResult(null) }} placeholder="…" />
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 14, maxWidth: 460 }}>
                <div style={{ flex: 1 }}>
                  <Label muted>Speech-to-text model</Label>
                  <TextInput mono value={value.voice.sttModel} onChange={(v) => setVoice({ sttModel: v })} placeholder="nova-3" />
                </div>
                <div style={{ flex: 1 }}>
                  <Label muted>Text-to-speech voice</Label>
                  <TextInput mono value={value.voice.ttsModel} onChange={(v) => setVoice({ ttsModel: v })} placeholder="aura-2-zeus-en" />
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Btn size="sm" variant="subtle" onClick={testVoice} disabled={voiceTesting}>{voiceTesting ? 'Testing…' : 'Test voice'}</Btn>
                {voiceTestResult && (
                  voiceTestResult.ok
                    ? <span style={{ fontSize: 12, color: C.green }}>✓ Should have just heard "Voice test. Systems nominal."</span>
                    : <span style={{ fontSize: 12, color: C.red }}>✗ {voiceTestResult.error}</span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
