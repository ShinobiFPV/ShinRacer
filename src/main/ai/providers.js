// AI Race Engineer — LLM provider adapters.
// Client-side only: every call here goes straight from this machine to the
// provider the driver configured (Claude, OpenAI, or a local OpenAI-compatible
// server). Never relayed through backend/ (the Pi-hosted service) and never
// touches imq2/Q2 in any way — see CLAUDE.md's cross-project link section for
// why that boundary matters. Runs in the main process (a Node/server context,
// not a browser), so no anthropic-dangerous-direct-browser-access header is
// needed for the Claude branch.

const ANTHROPIC_VERSION = '2023-06-01'

async function callClaude({ apiKey, model, systemPrompt, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `Claude API error (${res.status})` }
  }
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return { ok: true, text }
}

async function callOpenAiCompatible({ baseUrl, apiKey, model, systemPrompt, messages }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const headers = { 'content-type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `Request failed (${res.status})` }
  }
  const text = data?.choices?.[0]?.message?.content || ''
  return { ok: true, text }
}

// { provider: 'claude'|'openai'|'local', apiKey, model, baseUrl, systemPrompt,
//   messages: [{role:'user'|'assistant', content: string}, ...] }
// Never throws — every failure mode (missing config, network error, non-2xx
// response) comes back as { ok:false, error } so a single bad request can't
// crash the renderer, matching the rest of this app's IPC handler convention.
async function chatCompletion(req = {}) {
  const { provider, apiKey, model, baseUrl, systemPrompt, messages } = req

  try {
    if (provider === 'claude') {
      if (!apiKey) return { ok: false, error: 'No Anthropic API key configured.' }
      if (!model) return { ok: false, error: 'No model configured.' }
      return await callClaude({ apiKey, model, systemPrompt, messages })
    }

    if (provider === 'openai') {
      if (!apiKey) return { ok: false, error: 'No OpenAI API key configured.' }
      if (!model) return { ok: false, error: 'No model configured.' }
      return await callOpenAiCompatible({
        baseUrl: 'https://api.openai.com/v1',
        apiKey,
        model,
        systemPrompt,
        messages,
      })
    }

    if (provider === 'local') {
      if (!baseUrl) return { ok: false, error: 'No local server URL configured.' }
      if (!model) return { ok: false, error: 'No model configured.' }
      return await callOpenAiCompatible({ baseUrl, apiKey, model, systemPrompt, messages })
    }

    return { ok: false, error: `Unknown provider: ${provider}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = { chatCompletion }
