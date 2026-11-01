/**
 * Streaming tool executor — Claude Code StreamingToolExecutor spirit.
 *
 * - Tools start when a completed tool_call is available (not mid-JSON).
 * - Concurrent-safe tools may run in parallel; exclusive tools need sole access.
 * - Bash/PowerShell **execution** failure aborts siblings (not permission deny).
 * - discard() aborts in-flight work (streaming_fallback).
 * - Non-sibling tool aborts can bubble to the query AbortController.
 */
import type { ToolCall } from '../../shared/types.js'
import { isConcurrencySafe } from './registry.js'
import { parseToolArguments } from './orchestration.js'

export type StreamingToolResult = {
  call: ToolCall
  name: string
  ok: boolean
  output: string
  media?: import('./files/types.js').ToolMediaPart[]
}

/** Runner result — early deny must set executed=false so siblings are not killed. */
export type StreamingToolRunnerResult = {
  ok: boolean
  output: string
  /** True only after the tool body actually ran (not permission early-out). */
  executed: boolean
  media?: import('./files/types.js').ToolMediaPart[]
}

export type StreamingToolRunner = (
  call: ToolCall,
  signal: AbortSignal
) => Promise<StreamingToolRunnerResult>

type ToolStatus = 'queued' | 'executing' | 'completed' | 'yielded'

type TrackedTool = {
  call: ToolCall
  name: string
  status: ToolStatus
  isConcurrencySafe: boolean
  promise?: Promise<void>
  result?: StreamingToolResult
  thisToolErrored?: boolean
}

const SHELL_SIBLING_ABORT = new Set(['bash', 'powershell'])

export const SIBLING_CANCEL_PREFIX = 'Cancelled: parallel tool call'

export function isStreamingToolExecutionEnabled(): boolean {
  const off =
    process.env.ACKEM_DISABLE_STREAMING_TOOLS === '1' ||
    process.env.ACKEM_STREAMING_TOOL_EXECUTION === '0'
  if (off) return false
  return true
}

function createChildAbortController(parent: AbortSignal): AbortController {
  const child = new AbortController()
  if (parent.aborted) {
    child.abort(parent.reason)
    return child
  }
  const onAbort = () => {
    if (!child.signal.aborted) child.abort(parent.reason)
  }
  parent.addEventListener('abort', onAbort, { once: true })
  return child
}

export type StreamingToolExecutorOpts = {
  parentSignal?: AbortSignal
  /** Query-level controller — abort on non-sibling tool cancel (CC bubble-up). */
  abortController?: AbortController
}

export class StreamingToolExecutor {
  private tools: TrackedTool[] = []
  private hasErrored = false
  private erroredToolDescription = ''
  private discarded = false
  private readonly siblingAbort: AbortController
  private readonly parentSignal?: AbortSignal
  private readonly abortController?: AbortController

  constructor(
    private readonly runTool: StreamingToolRunner,
    opts?: AbortSignal | StreamingToolExecutorOpts
  ) {
    const normalized: StreamingToolExecutorOpts =
      opts && typeof opts === 'object' && 'aborted' in (opts as AbortSignal)
        ? { parentSignal: opts as AbortSignal }
        : ((opts as StreamingToolExecutorOpts | undefined) ?? {})
    this.parentSignal = normalized.parentSignal ?? normalized.abortController?.signal
    this.abortController = normalized.abortController
    this.siblingAbort = createChildAbortController(
      this.parentSignal ?? new AbortController().signal
    )
  }

  /**
   * Abandon queued/in-flight tools (stream fallback).
   * Aborts sibling controller so shells/signal-aware tools stop.
   */
  discard(): void {
    this.discarded = true
    if (!this.siblingAbort.signal.aborted) {
      this.siblingAbort.abort('streaming_fallback')
    }
  }

  addTool(call: ToolCall): void {
    if (this.discarded) return
    if (this.tools.some((t) => t.call.id === call.id)) return
    const name = call.function.name
    const parsed = parseToolArguments(call.function.arguments || '')
    const safe = parsed.ok && isConcurrencySafe(name, parsed.input)

    this.tools.push({
      call,
      name,
      status: 'queued',
      isConcurrencySafe: safe
    })
    void this.processQueue()
  }

  private canExecuteTool(isSafe: boolean): boolean {
    // After shell sibling failure / discard, do not start new work — queued
    // tools are synthesized immediately via completeQueuedAsSiblingErrors().
    if (this.hasErrored || this.discarded) return false
    const executing = this.tools.filter((t) => t.status === 'executing')
    return (
      executing.length === 0 ||
      (isSafe && executing.every((t) => t.isConcurrencySafe))
    )
  }

  /** Immediately synthesize queued tools when a shell sibling errors (CC spirit). */
  private completeQueuedAsSiblingErrors(): void {
    for (const t of this.tools) {
      if (t.status === 'queued') {
        t.result = this.synthetic(t, 'sibling_error')
        t.status = 'completed'
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.discarded) return
    for (const tool of this.tools) {
      if (tool.status !== 'queued') continue
      if (this.canExecuteTool(tool.isConcurrencySafe)) {
        await this.executeTool(tool)
      } else if (!tool.isConcurrencySafe) {
        break
      }
    }
  }

  private getAbortReason(
    tool: TrackedTool
  ): 'sibling_error' | 'user_interrupted' | 'streaming_fallback' | null {
    if (this.discarded) return 'streaming_fallback'
    if (this.hasErrored && !tool.thisToolErrored) return 'sibling_error'
    if (this.parentSignal?.aborted) {
      if (this.parentSignal.reason === 'sibling_error') {
        return tool.thisToolErrored ? null : 'sibling_error'
      }
      return 'user_interrupted'
    }
    if (this.siblingAbort.signal.aborted) {
      const reason = this.siblingAbort.signal.reason
      if (reason === 'streaming_fallback') return 'streaming_fallback'
      if (reason === 'sibling_error' || this.hasErrored) {
        return tool.thisToolErrored ? null : 'sibling_error'
      }
    }
    return null
  }

  private synthetic(
    tool: TrackedTool,
    reason: 'sibling_error' | 'user_interrupted' | 'streaming_fallback'
  ): StreamingToolResult {
    if (reason === 'user_interrupted') {
      return {
        call: tool.call,
        name: tool.name,
        ok: false,
        output: 'Tool execution aborted by user.'
      }
    }
    if (reason === 'streaming_fallback') {
      return {
        call: tool.call,
        name: tool.name,
        ok: false,
        output: 'Error: Streaming fallback - tool execution discarded'
      }
    }
    const desc = this.erroredToolDescription
    const msg = desc
      ? `${SIBLING_CANCEL_PREFIX} ${desc} errored`
      : `${SIBLING_CANCEL_PREFIX} errored`
    return { call: tool.call, name: tool.name, ok: false, output: msg }
  }

  private toolDescription(tool: TrackedTool): string {
    try {
      const input = JSON.parse(tool.call.function.arguments || '{}') as Record<
        string,
        unknown
      >
      const summary = input.command ?? input.file_path ?? input.pattern ?? ''
      if (typeof summary === 'string' && summary.length > 0) {
        const truncated =
          summary.length > 40 ? summary.slice(0, 40) + '…' : summary
        return `${tool.name}(${truncated})`
      }
    } catch {
      /* ignore */
    }
    return tool.name
  }

  private bubbleAbortIfNeeded(reason: unknown): void {
    if (
      reason === 'sibling_error' ||
      reason === 'streaming_fallback' ||
      this.discarded
    ) {
      return
    }
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort(reason)
    }
  }

  private async executeTool(tool: TrackedTool): Promise<void> {
    tool.status = 'executing'

    const collect = async () => {
      const initial = this.getAbortReason(tool)
      if (initial) {
        tool.result = this.synthetic(tool, initial)
        tool.status = 'completed'
        return
      }

      const toolAbort = createChildAbortController(this.siblingAbort.signal)
      toolAbort.signal.addEventListener(
        'abort',
        () => {
          if (
            toolAbort.signal.reason !== 'sibling_error' &&
            toolAbort.signal.reason !== 'streaming_fallback' &&
            !this.discarded &&
            !this.parentSignal?.aborted
          ) {
            // CC: permission reject etc. bubbles to query controller
            this.bubbleAbortIfNeeded(toolAbort.signal.reason)
          }
        },
        { once: true }
      )

      try {
        const result = await this.runTool(tool.call, toolAbort.signal)
        const killedBySibling =
          toolAbort.signal.aborted &&
          toolAbort.signal.reason === 'sibling_error'
        const killedByDiscard =
          toolAbort.signal.aborted &&
          (toolAbort.signal.reason === 'streaming_fallback' || this.discarded)
        const after = this.getAbortReason(tool)

        if (killedByDiscard || after === 'streaming_fallback') {
          tool.result = this.synthetic(tool, 'streaming_fallback')
        } else if (after && !tool.thisToolErrored) {
          tool.result = this.synthetic(tool, after)
        } else if (killedBySibling) {
          tool.result = this.synthetic(tool, 'sibling_error')
        } else {
          tool.result = {
            call: tool.call,
            name: tool.name,
            ok: result.ok,
            output: result.output,
            media: result.media
          }
          // Sibling cascade ONLY after real shell execution failure (not deny)
          if (
            !result.ok &&
            result.executed &&
            SHELL_SIBLING_ABORT.has(tool.name)
          ) {
            tool.thisToolErrored = true
            this.hasErrored = true
            this.erroredToolDescription = this.toolDescription(tool)
            this.siblingAbort.abort('sibling_error')
            this.completeQueuedAsSiblingErrors()
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const aborted =
          msg === 'aborted' ||
          toolAbort.signal.aborted ||
          this.parentSignal?.aborted
        if (aborted) {
          const reason = this.getAbortReason(tool) ?? 'user_interrupted'
          tool.result = this.synthetic(tool, reason)
          if (
            toolAbort.signal.aborted &&
            toolAbort.signal.reason !== 'sibling_error' &&
            toolAbort.signal.reason !== 'streaming_fallback'
          ) {
            this.bubbleAbortIfNeeded(toolAbort.signal.reason)
          }
        } else {
          tool.result = {
            call: tool.call,
            name: tool.name,
            ok: false,
            output: msg
          }
          // thrown shell failures after execution started — treat as executed
          if (SHELL_SIBLING_ABORT.has(tool.name)) {
            tool.thisToolErrored = true
            this.hasErrored = true
            this.erroredToolDescription = this.toolDescription(tool)
            this.siblingAbort.abort('sibling_error')
            this.completeQueuedAsSiblingErrors()
          }
        }
      }
      tool.status = 'completed'
    }

    tool.promise = collect()
    void tool.promise.finally(() => {
      void this.processQueue()
    })
  }

  drainCompleted(): StreamingToolResult[] {
    if (this.discarded) return []
    const out: StreamingToolResult[] = []
    for (const tool of this.tools) {
      if (tool.status === 'yielded') continue
      if (tool.status === 'completed' && tool.result) {
        tool.status = 'yielded'
        out.push(tool.result)
      } else if (tool.status === 'executing' && !tool.isConcurrencySafe) {
        break
      }
    }
    return out
  }

  async getRemainingResults(): Promise<StreamingToolResult[]> {
    if (this.discarded) return []
    const out: StreamingToolResult[] = []

    while (this.tools.some((t) => t.status !== 'yielded')) {
      await this.processQueue()

      for (const t of this.tools) {
        if (t.status === 'queued') {
          const reason = this.getAbortReason(t)
          if (reason) {
            t.result = this.synthetic(t, reason)
            t.status = 'completed'
          }
        }
      }

      const drained = this.drainCompleted()
      if (drained.length) {
        out.push(...drained)
        continue
      }

      const pending = this.tools
        .filter((t) => t.status === 'executing' && t.promise)
        .map((t) => t.promise!)
      if (pending.length) {
        await Promise.race(pending)
        continue
      }

      for (const t of this.tools) {
        if (t.status !== 'yielded' && t.status !== 'completed') {
          t.result = this.synthetic(
            t,
            this.getAbortReason(t) ?? 'user_interrupted'
          )
          t.status = 'completed'
        }
      }
      out.push(...this.drainCompleted())
    }
    return out
  }

  /**
   * After discard(): wait in-flight to notice abort, synthesize results for UI
   * orphan tool_start rows (not for next-turn messages unless caller wants).
   */
  async finalizeDiscard(): Promise<StreamingToolResult[]> {
    this.discard()
    const pending = this.tools
      .filter((t) => t.promise && (t.status === 'executing' || t.status === 'queued'))
      .map((t) => t.promise!)
    if (pending.length) {
      await Promise.allSettled(pending)
    }
    // Complete anything still queued
    for (const t of this.tools) {
      if (t.status === 'queued' || t.status === 'executing') {
        t.result = this.synthetic(t, 'streaming_fallback')
        t.status = 'completed'
      }
      if (t.status === 'completed' && !t.result) {
        t.result = this.synthetic(t, 'streaming_fallback')
      }
    }
    const out: StreamingToolResult[] = []
    for (const t of this.tools) {
      if (t.status === 'yielded') continue
      if (t.result) {
        t.status = 'yielded'
        out.push(t.result)
      }
    }
    return out
  }

  getTracked(): ReadonlyArray<{
    id: string
    name: string
    status: ToolStatus
    isConcurrencySafe: boolean
  }> {
    return this.tools.map((t) => ({
      id: t.call.id,
      name: t.name,
      status: t.status,
      isConcurrencySafe: t.isConcurrencySafe
    }))
  }
}
