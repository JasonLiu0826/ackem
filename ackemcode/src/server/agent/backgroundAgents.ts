/**
 * In-session background / async agent hub — Claude Code LocalAgentTask +
 * runAsyncAgentLifecycle spirit (Ackem-owned; no Ink).
 *
 * - Spawn detaches from parent AbortSignal (survives main-turn ESC).
 * - On terminal: one-shot task-notification enqueue (dedup via `notified`).
 * - Idle pump wakes the main session when the queue has work and no turn runs.
 * - GM-AGENT: TaskStop / TaskOutput spirit via stop() / getOutput() / waitFor().
 */
import type { AgentEvent } from '../../shared/types.js'
import type { SessionMessageQueue } from './messageQueue.js'
import {
  formatTaskNotificationXml,
  isBackgroundTasksDisabled,
  summarizeAgentResult,
  type TaskNotificationStatus
} from './taskNotification.js'

export type BackgroundAgentStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed'

/** Cap stored agent report (CC TaskOutput maxResultSizeChars spirit). */
export const MAX_BACKGROUND_AGENT_OUTPUT_CHARS = 100_000

export type BackgroundAgentRecord = {
  agentId: string
  description: string
  subagentType: string
  status: BackgroundAgentStatus
  startedAt: string
  finishedAt?: string
  notified: boolean
  reportPreview?: string
  /** Full terminal report (capped); preferred by agent_output. */
  report?: string
  error?: string
  toolUseId?: string
  /** Who receives task-notification (undefined = main session). */
  notifyAgentId?: string
}

export type AgentStopResult =
  | {
      ok: true
      agentId: string
      description: string
      taskType: 'local_agent'
      message: string
    }
  | {
      ok: false
      code: 'not_found' | 'not_running'
      agentId: string
      message: string
      status?: BackgroundAgentStatus
    }

export type AgentOutputRetrieval =
  | 'success'
  | 'not_ready'
  | 'timeout'
  | 'not_found'

export type AgentOutputResult = {
  retrieval_status: AgentOutputRetrieval
  agentId: string
  status?: BackgroundAgentStatus
  description?: string
  subagentType?: string
  output: string
  error?: string
  notified?: boolean
}

type RunningHandle = {
  record: BackgroundAgentRecord
  abort: AbortController
  notified: boolean
}

export type BackgroundNotifyHooks = {
  messageQueue: SessionMessageQueue
  /** True while main runAgentTurn is in flight. */
  isTurnRunning: () => boolean
  emit?: (event: AgentEvent) => void
  /** Schedule idle queue drain (host wires pump). */
  scheduleIdlePump?: () => void
  /** D1: Notification hook (CC Notification spirit). */
  fireNotification?: (message: string, notificationType?: string) => void
}

export class BackgroundAgentHub {
  private running = new Map<string, RunningHandle>()
  private history: BackgroundAgentRecord[] = []
  private hooks: BackgroundNotifyHooks | null = null

  bind(hooks: BackgroundNotifyHooks): void {
    this.hooks = hooks
  }

  list(): BackgroundAgentRecord[] {
    const live = [...this.running.values()].map((h) => ({ ...h.record }))
    return [...live, ...this.history].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt)
    )
  }

  get(agentId: string): BackgroundAgentRecord | undefined {
    const live = this.running.get(agentId)
    if (live) return { ...live.record }
    return this.history.find((h) => h.agentId === agentId)
  }

  /** AbortController for a running background agent (independent of parent). */
  abortControllerFor(agentId: string): AbortController | undefined {
    return this.running.get(agentId)?.abort
  }

  register(opts: {
    agentId: string
    description: string
    subagentType: string
    toolUseId?: string
    /** Parent sub-agent id when spawned from a foreground sub-agent. */
    notifyAgentId?: string
  }): AbortController {
    const existing = this.running.get(opts.agentId)
    if (existing) return existing.abort
    const abort = new AbortController()
    const record: BackgroundAgentRecord = {
      agentId: opts.agentId,
      description: opts.description,
      subagentType: opts.subagentType,
      status: 'running',
      startedAt: new Date().toISOString(),
      notified: false,
      toolUseId: opts.toolUseId,
      notifyAgentId: opts.notifyAgentId
    }
    this.running.set(opts.agentId, { record, abort, notified: false })
    this.hooks?.emit?.({
      type: 'status',
      message: `background agent started · ${opts.agentId} · ${opts.description}`
    })
    return abort
  }

  kill(agentId: string): boolean {
    return this.stop(agentId).ok
  }

  /**
   * TaskStop spirit — abort a running background agent.
   * Completion (and task-notification) still arrives via the spawn promise → complete().
   */
  stop(agentId: string): AgentStopResult {
    const id = agentId.trim()
    if (!id) {
      return {
        ok: false,
        code: 'not_found',
        agentId: id,
        message: 'Missing required parameter: task_id'
      }
    }
    const h = this.running.get(id)
    if (!h) {
      const prior = this.history.find((x) => x.agentId === id)
      if (prior) {
        return {
          ok: false,
          code: 'not_running',
          agentId: id,
          status: prior.status,
          message: `Task ${id} is not running (status: ${prior.status})`
        }
      }
      return {
        ok: false,
        code: 'not_found',
        agentId: id,
        message: `No task found with ID: ${id}`
      }
    }
    h.abort.abort('killed')
    this.hooks?.emit?.({
      type: 'status',
      message: `background agent stop requested · ${id}`
    })
    return {
      ok: true,
      agentId: id,
      description: h.record.description,
      taskType: 'local_agent',
      message: `Successfully stopped task: ${id} (${h.record.description})`
    }
  }

  /**
   * Wait until agent leaves `running`, or timeout / abort.
   * Returns latest record (may still be running on timeout).
   */
  async waitFor(
    agentId: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<BackgroundAgentRecord | null> {
    const id = agentId.trim()
    const budget = Math.max(0, Math.min(600_000, timeoutMs))
    const started = Date.now()
    while (true) {
      if (signal?.aborted) return this.get(id) ?? null
      const cur = this.get(id)
      if (!cur) return null
      if (cur.status !== 'running') return cur
      if (Date.now() - started >= budget) return cur
      await sleepMs(40, signal)
    }
  }

  /**
   * TaskOutput spirit — poll or block for background agent output.
   * On terminal success, marks `notified` (CC TaskOutput mark-notified spirit).
   */
  async getOutput(opts: {
    agentId: string
    block?: boolean
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<AgentOutputResult> {
    const id = opts.agentId.trim()
    if (!id) {
      return {
        retrieval_status: 'not_found',
        agentId: id,
        output: '',
        error: 'Task ID is required'
      }
    }

    let record = this.get(id)
    if (!record) {
      return {
        retrieval_status: 'not_found',
        agentId: id,
        output: '',
        error: `No task found with ID: ${id}`
      }
    }

    const block = opts.block !== false
    const timeoutMs = opts.timeoutMs ?? 30_000

    if (block && record.status === 'running') {
      record = (await this.waitFor(id, timeoutMs, opts.signal)) ?? record
    }

    if (record.status === 'running') {
      return {
        retrieval_status: block ? 'timeout' : 'not_ready',
        agentId: id,
        status: record.status,
        description: record.description,
        subagentType: record.subagentType,
        output: record.report || record.reportPreview || '',
        notified: record.notified
      }
    }

    this.markNotified(id)
    const fresh = this.get(id) ?? record
    return {
      retrieval_status: 'success',
      agentId: id,
      status: fresh.status,
      description: fresh.description,
      subagentType: fresh.subagentType,
      output: fresh.report || fresh.reportPreview || '',
      error: fresh.error,
      notified: fresh.notified
    }
  }

  /** Mark history/running row notified (after output retrieved). */
  markNotified(agentId: string): void {
    const h = this.running.get(agentId)
    if (h) {
      h.notified = true
      h.record.notified = true
    }
    const idx = this.history.findIndex((x) => x.agentId === agentId)
    if (idx >= 0) {
      this.history[idx] = { ...this.history[idx]!, notified: true }
    }
  }

  /**
   * Mark terminal + enqueue one-shot task-notification (CC enqueueAgentNotification).
   */
  complete(opts: {
    agentId: string
    ok: boolean
    killed?: boolean
    report: string
    error?: string
    description?: string
  }): void {
    const h = this.running.get(opts.agentId)
    const prior = this.history.find((x) => x.agentId === opts.agentId)
    if (!h && prior?.notified) {
      return
    }

    const description =
      opts.description || h?.record.description || prior?.description || opts.agentId
    const { status, summary } = summarizeAgentResult({
      ok: opts.ok,
      killed: opts.killed || opts.error === 'killed' || opts.error === 'aborted',
      report: opts.report,
      error: opts.error,
      description
    })

    const fullReport = truncateAgentOutput(opts.report)
    const record: BackgroundAgentRecord = {
      agentId: opts.agentId,
      description,
      subagentType: h?.record.subagentType || prior?.subagentType || 'agent',
      status: status as BackgroundAgentStatus,
      startedAt: h?.record.startedAt || prior?.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      notified: false,
      report: fullReport,
      reportPreview: fullReport.slice(0, 500),
      error: opts.error,
      toolUseId: h?.record.toolUseId || prior?.toolUseId,
      notifyAgentId: h?.record.notifyAgentId || prior?.notifyAgentId
    }

    if (h) this.running.delete(opts.agentId)

    if (h?.notified) {
      record.notified = true
      this.history.unshift(record)
      this.trimHistory()
      return
    }

    const enqueued = this.enqueueNotification(
      record,
      status,
      summary,
      opts.report
    )
    // Mark notified even when background tasks disabled (skip queue, no retry spam)
    record.notified = true
    if (h) h.notified = true
    if (!enqueued && isBackgroundTasksDisabled()) {
      hooksStatus(this.hooks, record.agentId, 'skipped (background tasks disabled)')
    }
    // Replace any prior history row for this id
    this.history = this.history.filter((x) => x.agentId !== opts.agentId)
    this.history.unshift(record)
    this.trimHistory()
  }

  /** @returns true when a queue item was created */
  private enqueueNotification(
    record: BackgroundAgentRecord,
    status: TaskNotificationStatus,
    summary: string,
    result: string
  ): boolean {
    const hooks = this.hooks
    if (!hooks) return false
    if (isBackgroundTasksDisabled()) return false
    const xml = formatTaskNotificationXml({
      taskId: record.agentId,
      toolUseId: record.toolUseId,
      status,
      summary,
      result
    })
    try {
      const item = hooks.messageQueue.enqueuePendingNotification(xml, {
        agentId: record.notifyAgentId
      })
      if (!item) return false
      hooks.emit?.({
        type: 'message_queued',
        id: item.id,
        text: item.text,
        queueLength: hooks.messageQueue.length,
        priority: item.priority,
        mode: item.mode
      })
      hooks.emit?.({
        type: 'status',
        message: `task-notification queued · ${record.agentId} · ${status}`
      })
      hooks.fireNotification?.(
        `Background agent ${record.agentId} ${status}: ${summary}`,
        'task_notification'
      )
      if (!hooks.isTurnRunning()) {
        hooks.scheduleIdlePump?.()
      }
      return true
    } catch (e) {
      console.error('background task-notification enqueue failed', e)
      return false
    }
  }

  private trimHistory(): void {
    if (this.history.length > 40) this.history.length = 40
  }
}

function hooksStatus(
  hooks: BackgroundNotifyHooks | null,
  agentId: string,
  detail: string
): void {
  hooks?.emit?.({
    type: 'status',
    message: `task-notification · ${agentId} · ${detail}`
  })
}

function truncateAgentOutput(text: string): string {
  if (text.length <= MAX_BACKGROUND_AGENT_OUTPUT_CHARS) return text
  return (
    text.slice(0, MAX_BACKGROUND_AGENT_OUTPUT_CHARS) +
    `\n\n…[truncated at ${MAX_BACKGROUND_AGENT_OUTPUT_CHARS} chars]`
  )
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const t = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(t)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Format agent_output tool payload (XML-ish, CC TaskOutput map spirit). */
export function formatAgentOutputToolResult(r: AgentOutputResult): string {
  const parts = [
    `<retrieval_status>${r.retrieval_status}</retrieval_status>`,
    `<task_id>${r.agentId}</task_id>`,
    `<task_type>local_agent</task_type>`
  ]
  if (r.status) parts.push(`<status>${r.status}</status>`)
  if (r.description) parts.push(`<description>${r.description}</description>`)
  if (r.subagentType) parts.push(`<subagent_type>${r.subagentType}</subagent_type>`)
  if (r.error) parts.push(`<error>${r.error}</error>`)
  if (r.output.trim()) {
    parts.push(`<output>\n${r.output.trimEnd()}\n</output>`)
  } else {
    parts.push('<output></output>')
  }
  return parts.join('\n')
}
