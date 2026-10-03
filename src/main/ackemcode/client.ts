import { ackemCodeBaseUrl, ensureDaemon } from './ensureDaemon'
import {
  parseHostTurnReceipt,
  parseTransportEvent,
  type AgentEvent,
  type HostTurnReceipt,
  type ProtocolWarning
} from './protocol'

export type { AgentEvent, HostTurnReceipt, ProtocolWarning }

export type AckemTask = {
  kind: 'work.job' | 'openforu.create' | 'openforu.update'
  summary: string
  tag: string | null
}

export type CodeSessionSnapshot = {
  sessionId: string
  hostTurnReceipt?: HostTurnReceipt
}

export async function createCodeSession(input: {
  cwd: string
  ackemTask?: AckemTask
}): Promise<{ sessionId: string }> {
  const ready = await ensureDaemon()
  if (!ready.ok) throw new Error(ready.reason)
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cwd: input.cwd,
      permissionMode: 'default',
      ackemTask: input.ackemTask
    })
  })
  if (!res.ok) throw new Error(`创建任务失败：${res.status}`)
  const json = (await res.json()) as { sessionId: string }
  return { sessionId: json.sessionId }
}

export async function abortCodeSession(sessionId: string): Promise<void> {
  await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}/abort`, { method: 'POST' }).catch(
    () => undefined
  )
}

/** Read Runtime session snapshot. Missing receipt stays undefined. */
export async function getCodeSessionSnapshot(sessionId: string): Promise<CodeSessionSnapshot | null> {
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`读取任务快照失败：${res.status}`)
  const json = (await res.json()) as { sessionId?: string; hostTurnReceipt?: unknown }
  return {
    sessionId: typeof json.sessionId === 'string' ? json.sessionId : sessionId,
    hostTurnReceipt: parseHostTurnReceipt(json.hostTurnReceipt)
  }
}

export type CodeFollowEnqueue =
  | { ok: true; queued: true }
  | { ok: false; status: number; error: string }

/**
 * Queue a follow-up on the running host turn. The response is JSON, not SSE.
 * This does not read a stream, emit a disconnect, or change the ActionRun.
 */
export async function enqueueCodeFollow(input: {
  sessionId: string
  text: string
  hostRunId: string
}): Promise<CodeFollowEnqueue> {
  let res: Response
  try {
    res = await fetch(`${ackemCodeBaseUrl()}/api/session/${input.sessionId}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: input.text,
        hostRunId: input.hostRunId,
        follow: true
      })
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 0, error: message }
  }
  let body: { queued?: boolean; error?: string } = {}
  try {
    body = (await res.json()) as { queued?: boolean; error?: string }
  } catch {
    body = {}
  }
  if (res.status === 409) {
    return { ok: false, status: 409, error: typeof body.error === 'string' ? body.error : 'host_run_duplicate' }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: body.error || `跟一句失败：${res.status}` }
  }
  if (body.queued === true) return { ok: true, queued: true }
  return { ok: false, status: res.status, error: body.error || '跟一句没有进入队列' }
}

/** Transport only. Does not write action status and does not invent a done event. */
export function startChatStream(input: {
  sessionId: string
  text: string
  hostRunId?: string
  onEvent: (ev: AgentEvent) => void
  onError: (err: Error) => void
  onDisconnect?: () => void
  onProtocolWarning?: (warning: ProtocolWarning) => void
}): void {
  void (async () => {
    let sawDone = false
    try {
      const res = await fetch(`${ackemCodeBaseUrl()}/api/session/${input.sessionId}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: input.text,
          ...(input.hostRunId ? { hostRunId: input.hostRunId } : {})
        })
      })
      if (!res.ok || !res.body) {
        throw new Error(`任务流失败：${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          const payload = line.slice(5).trim()
          let parsed: unknown
          try {
            parsed = JSON.parse(payload)
          } catch {
            input.onProtocolWarning?.({
              sessionId: input.sessionId,
              reason: 'malformed_json',
              detail: payload.slice(0, 120)
            })
            continue
          }
          const event = parseTransportEvent(input.sessionId, parsed)
          if (!event.ok) {
            input.onProtocolWarning?.(event.warning)
            continue
          }
          if (event.event.type === 'done') sawDone = true
          input.onEvent(event.event)
        }
      }
      if (!sawDone) input.onDisconnect?.()
    } catch (e) {
      input.onError(e instanceof Error ? e : new Error(String(e)))
    }
  })()
}
