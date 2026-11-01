// [ackemcode/client] — 与 Ackem Code 本地服务通信的最小客户端
// 只暴露桥接需要的接口：建会话、发一轮、中止、读会话。

import { createLogger } from '../logger'
import { ackemCodeBaseUrl } from './daemon'

const log = createLogger('ackemcode')

export type PermissionMode =
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'dontAsk'

export type CodeSession = {
  sessionId: string
  mode: PermissionMode
  cwd: string | null
  restored?: boolean
  historyLength?: number
}

/** 桥接层实际消费的事件子集（其它事件原样透传） */
export type CodeEvent = {
  type: string
  text?: string
  message?: string
  ok?: boolean
  error?: string
  [k: string]: unknown
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

async function callJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ackemCodeBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status} ${path}`)
    ;(err as Error & { code?: string }).code = data.error
    throw err
  }
  return data
}

export function createCodeSession(opts: {
  cwd?: string
  sessionId?: string
  permissionMode?: PermissionMode
}): Promise<CodeSession> {
  return callJson<CodeSession>('/api/session', {
    method: 'POST',
    body: JSON.stringify(opts)
  })
}

export function getCodeSession(sessionId: string): Promise<CodeSession & { history: ChatMessage[] }> {
  return callJson(`/api/session/${encodeURIComponent(sessionId)}`)
}

export function abortCodeTurn(
  sessionId: string,
  body: { restoreInput?: boolean; rewind?: boolean } = {}
): Promise<{ ok: boolean }> {
  return callJson(`/api/session/${encodeURIComponent(sessionId)}/abort`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export type PostChatOptions = {
  sessionId: string
  text: string
  signal?: AbortSignal
  onEvent: (ev: CodeEvent) => void
}

/** 发一轮对话，SSE 逐事件回调；返回时代表本轮流已结束 */
export async function postChat(opts: PostChatOptions): Promise<void> {
  const url = `${ackemCodeBaseUrl()}/api/session/${encodeURIComponent(opts.sessionId)}/chat`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ text: opts.text }),
    signal: opts.signal
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(body.message || body.error || `chat ${res.status}`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { queued?: boolean }
    if (data.queued) log.info('消息已排队', { sessionId: opts.sessionId })
    return
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
      const payload = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('')
      if (!payload) continue
      try {
        opts.onEvent(JSON.parse(payload) as CodeEvent)
      } catch {
        /* 忽略半截/异常帧 */
      }
    }
  }
}
