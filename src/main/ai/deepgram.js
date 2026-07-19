// AI Race Engineer — voice (Deepgram STT/TTS), push-to-talk only, no wake word.
// Same provider imq2's voice pipeline defaults to for both directions, ported
// here as plain REST calls (no SDK dependency) since this app has no Python
// runtime to install the Deepgram SDK into. Client-side only, same as
// providers.js — calls go straight from this machine to Deepgram, never
// through backend/ or anywhere near imq2/Q2.

const LISTEN_URL = 'https://api.deepgram.com/v1/listen'
const SPEAK_URL = 'https://api.deepgram.com/v1/speak'

// { apiKey, model, language, audioBase64, mimeType } -> { ok, text, error }
// audioBase64 is the recorded utterance (whatever container MediaRecorder
// produced, e.g. audio/webm) — Deepgram reads the container header itself,
// same as imq2 just handing it a WAV blob without separate sample-rate params.
async function transcribe({ apiKey, model, language, audioBase64, mimeType }) {
  if (!apiKey) return { ok: false, error: 'No Deepgram API key configured.' }
  if (!audioBase64) return { ok: false, error: 'No audio recorded.' }

  try {
    const url = new URL(LISTEN_URL)
    url.searchParams.set('model', model || 'nova-3')
    url.searchParams.set('language', language || 'en-US')
    url.searchParams.set('smart_format', 'true')

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': mimeType || 'audio/webm',
      },
      body: Buffer.from(audioBase64, 'base64'),
    })
    const data = await res.json()
    if (!res.ok) {
      return { ok: false, error: data?.err_msg || data?.message || `Deepgram error (${res.status})` }
    }
    const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    if (!text) return { ok: false, error: 'Could not make out anything — try again.' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// { apiKey, model, text } -> { ok, audioBase64, mimeType, error }
async function synthesize({ apiKey, model, text }) {
  if (!apiKey) return { ok: false, error: 'No Deepgram API key configured.' }
  if (!text?.trim()) return { ok: false, error: 'Nothing to speak.' }

  try {
    const url = new URL(SPEAK_URL)
    url.searchParams.set('model', model || 'aura-2-zeus-en')
    url.searchParams.set('encoding', 'mp3') // browser-playable directly, no PCM decoding needed

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      let error = `Deepgram error (${res.status})`
      try { error = (await res.json())?.err_msg || error } catch { /* body wasn't JSON */ }
      return { ok: false, error }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: true, audioBase64: buf.toString('base64'), mimeType: 'audio/mp3' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = { transcribe, synthesize }
