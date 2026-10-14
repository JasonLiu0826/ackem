import { ackemCodeBaseUrl, ensureDaemon } from './ensureDaemon'
import { codeSessionHeaders, newCodeSessionBinding, rememberCodeSessionBinding } from './hostSessionBindings'
export { codeSessionHeaders } from './hostSessionBindings'
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

export type HostTaskContext = { taskId: string; goalRevision: number; controlEpoch: number; fencingToken: number; readOnly?: boolean; allowedReadPaths?:string[];allowedResourcePaths?:string[];readOnlyResourcePaths?:string[];excludedResourcePaths?:string[]; deadline?:number;maxContextTokens?:number;maxModelCalls?:number }
export type KernelTaskCapabilities = { protocolVersion: number; capabilities: { taskBinding?: boolean; goalRevisionFence?: boolean; toolBoundary?: boolean; stopSettlement?: boolean; processTreeCancel?: boolean;taskBudgets?:boolean;scopedInspection?:boolean;executionOptions?:boolean;fullMachineAccess?:boolean } }
export async function getKernelTaskCapabilities(): Promise<KernelTaskCapabilities> {
  const res = await fetch(`${ackemCodeBaseUrl()}/api/health`)
  if (!res.ok) throw new Error(`Kernel health: ${res.status}`)
  const body = await res.json() as Partial<KernelTaskCapabilities>
  return { protocolVersion: typeof body.protocolVersion === 'number' ? body.protocolVersion : 1, capabilities: body.capabilities ?? {} }
}
export async function setHostTask(sessionId: string, hostTask: HostTaskContext, stopped = false): Promise<void> {
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}/host-task`, { method: 'POST', headers: codeSessionHeaders(sessionId), body: JSON.stringify({ hostTask, stopped }) })
  if (!res.ok) throw new Error(`Kernel task fence: ${res.status}`)
}
export async function setHostTaskHold(sessionId: string, hostTask: HostTaskContext, held: boolean): Promise<void> {
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}/host-task-hold`, { method:'POST', headers:codeSessionHeaders(sessionId), body:JSON.stringify({hostTask,held}) })
  if (!res.ok) throw new Error(`Kernel task hold: ${res.status}`)
}
export async function stopHostTask(sessionId: string): Promise<{ stopState: 'acknowledged' | 'settled' | 'unknown'; cancellationScope: string }> {
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}/abort`, { method: 'POST', headers: codeSessionHeaders(sessionId) })
  if (!res.ok) throw new Error(`Kernel task stop: ${res.status}`)
  const body = await res.json() as { stopState?: string; cancellationScope?: string; executionQuiescent?: boolean }
  if (body.stopState !== 'acknowledged' && body.stopState !== 'settled' && body.stopState !== 'unknown') throw new Error('Kernel does not support honest stop settlement')
  return { stopState: body.stopState, cancellationScope: body.cancellationScope ?? 'unknown' }
}
export type CodeSessionSnapshot = {
  sessionId: string
  hostTurnReceipt?: HostTurnReceipt
  hostTask?: HostTaskContext
  hostTaskHeld?: boolean
  hostTaskStopped?: boolean
  turnRunning?: boolean
  stopState?: 'acknowledged' | 'settled' | 'unknown'
  cancellationScope?: string
  executionQuiescent?: boolean
  history?:Array<{role:string;content:string}>
}

export async function createCodeSession(input: {
  cwd: string
  ackemTask?: AckemTask
  hostTask?: HostTaskContext
}): Promise<{ sessionId: string }> {
  const ready = await ensureDaemon()
  if (!ready.ok) throw new Error(ready.reason)
  const binding = newCodeSessionBinding()
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ackem-host-binding': binding },
    body: JSON.stringify({
      cwd: input.cwd,
      permissionMode: 'default',
      hostTask: input.hostTask,
      ackemTask: input.ackemTask
    })
  })
  if (!res.ok) throw new Error(`创建任务失败：${res.status}`)
  const json = (await res.json()) as { sessionId: string }
  rememberCodeSessionBinding(json.sessionId, binding)
  return { sessionId: json.sessionId }
}

export async function abortCodeSession(sessionId: string): Promise<void> {
  await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}/abort`, { method: 'POST', headers: codeSessionHeaders(sessionId) }).catch(
    () => undefined
  )
}

/** Read Runtime session snapshot. Missing receipt stays undefined. */
export async function getCodeSessionSnapshot(sessionId: string,signal?:AbortSignal): Promise<CodeSessionSnapshot | null> {
  const res = await fetch(`${ackemCodeBaseUrl()}/api/session/${sessionId}`, { headers: codeSessionHeaders(sessionId),signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`读取任务快照失败：${res.status}`)
  const json = (await res.json()) as { sessionId?: string; hostTurnReceipt?: unknown; hostTask?: HostTaskContext; hostTaskStopped?: boolean; hostTaskHeld?: boolean; turnRunning?: boolean; stopState?: CodeSessionSnapshot['stopState']; cancellationScope?: string; executionQuiescent?: boolean;history?:Array<{role:string;content:unknown}> }
  return {
    sessionId: typeof json.sessionId === 'string' ? json.sessionId : sessionId,
    hostTask: json.hostTask ?? undefined,
    hostTaskStopped: json.hostTaskStopped,
    hostTaskHeld: json.hostTaskHeld,
    turnRunning: json.turnRunning,
    stopState: json.stopState ?? undefined,
    cancellationScope: json.cancellationScope,
    executionQuiescent: json.executionQuiescent,
    history:Array.isArray(json.history)?json.history.filter(row=>row?.role==='assistant').map(row=>({role:row.role,content:typeof row.content==='string'?row.content:''})):undefined,
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
      headers: codeSessionHeaders(input.sessionId),
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

/** 内核附件形状 (path 必须是 daemon 进程可读的本机绝对路径)。 */
export type KernelAttachment = {
  path: string
  kind: 'file' | 'dir' | 'image'
  source?: 'workbench_chip' | 'workbench_open'
}

/** Transport only. Does not write action status and does not invent a done event. */
export function startChatStream(input: {
  sessionId: string
  text: string
  hostRunId?: string
  effort?: 'low' | 'medium' | 'high' | 'max'
  hostTask?: HostTaskContext
  /** 内核附件 (含图片) — daemon 从这些路径读取。 */
  attachments?: KernelAttachment[]
  /** true = 编辑上一轮: 内核先回滚该轮文件再以新文本重跑 (retry-last-turn)。 */
  retryLastTurn?: boolean
  signal?: AbortSignal
  onEvent: (ev: AgentEvent) => void
  onError: (err: Error) => void
  onDisconnect?: () => void
  onProtocolWarning?: (warning: ProtocolWarning) => void
}): void {
  void (async () => {
    let sawDone = false
    try {
      const endpoint = input.retryLastTurn
        ? `/api/session/${input.sessionId}/retry-last-turn`
        : `/api/session/${input.sessionId}/chat`
      const res = await fetch(`${ackemCodeBaseUrl()}${endpoint}`, {
        method: 'POST',
        signal:input.signal,
        headers: codeSessionHeaders(input.sessionId),
        body: JSON.stringify({
          text: input.text,
          ...(input.effort ? { effort: input.effort } : {}),
          ...(input.hostTask ? { hostTask: input.hostTask } : {}),
          ...(input.hostRunId ? { hostRunId: input.hostRunId } : {}),
          ...(input.attachments?.length ? { attachments: input.attachments } : {})
        })
      })
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({})) as { error?: string; message?: string }
        throw new Error(detail.message || detail.error || `任务流失败：${res.status}`)
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
