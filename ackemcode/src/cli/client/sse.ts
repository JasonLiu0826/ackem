import type { AgentEvent } from '../../shared/types.js'
import { apiBase } from './api.js'

export type ChatPostOpts = {
  sessionId: string
  text: string
  attachments?: Array<{ path: string; kind: 'file' | 'dir' | 'image' }>
  priority?: 'now' | 'next' | 'later'
  mode?: 'prompt' | 'slash'
  onEvent: (ev: AgentEvent) => void
}

export async function postChat(opts: ChatPostOpts): Promise<void> {
  const res = await fetch(`${apiBase()}/api/session/${opts.sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      text: opts.text,
      attachments: opts.attachments,
      priority: opts.priority,
      mode: opts.mode
    })
  })

  const ct = res.headers.get('content-type') || ''
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
    }
    throw Object.assign(new Error(body.message || body.error || `chat ${res.status}`), {
      code: body.error
    })
  }

  if (ct.includes('application/json')) {
    const data = (await res.json()) as { queued?: boolean }
    if (data.queued) return
  }

  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const chunks = buf.split('\n\n')
    buf = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const line = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('')
      if (!line) continue
      try {
        opts.onEvent(JSON.parse(line) as AgentEvent)
      } catch {
        /* ignore malformed */
      }
    }
  }
}
