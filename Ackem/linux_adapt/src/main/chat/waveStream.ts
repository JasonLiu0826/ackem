import type { WebContents } from 'electron'
import type { WaveEndpoint } from './waveEndpoint'

type AnthropicMsg = { role: 'user' | 'assistant'; content: string }

export function openAiMessagesToAnthropic(
  messages: Array<{ role: string; content: string }>
): { system: string; messages: AnthropicMsg[] } {
  let system = ''
  const out: AnthropicMsg[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      system += (system ? '\n\n' : '') + m.content
    } else if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content })
    }
  }
  return { system, messages: out }
}

export async function streamAnthropicPayload(
  webContents: WebContents,
  endpoint: WaveEndpoint,
  payload: { system: string; messages: AnthropicMsg[] },
  intensityMod: number,
  signal: AbortSignal
): Promise<string> {
  let acc = ''
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      max_tokens: endpoint.maxTokens,
      temperature: Math.max(0.1, Math.min(1.5, 0.6 * intensityMod)),
      system: payload.system || undefined,
      messages: payload.messages,
      stream: true
    }),
    signal
  })
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 400)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })
    const parts = lineBuf.split('\n')
    lineBuf = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          type?: string
          delta?: { type?: string; text?: string }
        }
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
          acc += json.delta.text
          webContents.send('chat:chunk', json.delta.text)
        }
      } catch {
        /* ignore */
      }
    }
  }
  return acc
}
