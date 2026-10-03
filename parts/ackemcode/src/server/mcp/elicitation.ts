/**
 * MCP elicitation broker — Claude Code elicitationHandler spirit.
 * Blocks tool/call until UI responds via API / AgentEvent.
 * GM-HOOK: optional Elicitation / ElicitationResult hooks (matcher=mcp_server_name).
 */
import { nanoid } from 'nanoid'
import type { ElicitRequestParams, ElicitResult } from '@modelcontextprotocol/sdk/types.js'
import type { AggregatedHookResult, HooksConfig } from '../hooks/types.js'

export type McpElicitationPending = {
  id: string
  serverName: string
  message: string
  mode: 'form' | 'url'
  requestedSchema?: unknown
  url?: string
  createdAt: number
}

type Waiter = {
  resolve: (r: ElicitResult) => void
  reject: (e: Error) => void
  meta: McpElicitationPending
}

export type ElicitationEmit = (ev: {
  type: 'mcp_elicitation'
  requestId: string
  serverName: string
  message: string
  mode: 'form' | 'url'
  requestedSchema?: unknown
  url?: string
}) => void

export type ElicitationHooksContext = {
  config?: HooksConfig
  disabled?: boolean
  cwd?: string
  sessionId?: string
  permissionMode?: string
}

type HooksRunner = (opts: {
  event: 'Elicitation' | 'ElicitationResult'
  config: HooksConfig | undefined
  disabled?: boolean
  cwd: string
  input: {
    session_id: string
    cwd: string
    permission_mode?: string
    hook_event_name: 'Elicitation' | 'ElicitationResult'
    mcp_server_name: string
    message?: string
    action?: 'accept' | 'decline' | 'cancel'
  }
}) => Promise<AggregatedHookResult>

function elicitationActionFromHooks(
  agg: AggregatedHookResult
): ElicitResult | null {
  if (agg.blocking) {
    return { action: 'decline' }
  }
  for (const r of agg.results) {
    const o = r.json?.hookSpecificOutput as
      | { action?: string; content?: unknown }
      | undefined
    if (!o || typeof o !== 'object') continue
    const action = o.action
    if (action === 'accept' || action === 'decline' || action === 'cancel') {
      const out: ElicitResult = { action }
      if (action === 'accept' && o.content != null && typeof o.content === 'object') {
        out.content = o.content as ElicitResult['content']
      }
      return out
    }
  }
  return null
}

export class McpElicitationBroker {
  private waiters = new Map<string, Waiter>()
  private emitFn: ElicitationEmit | null = null
  private hooksCtx: ElicitationHooksContext = {}
  private hooksRunner: HooksRunner | null = null

  setEmit(fn: ElicitationEmit | null): void {
    this.emitFn = fn
  }

  /** Wire SessionStart-scoped hooks config for Elicitation events. */
  setHooksContext(ctx: ElicitationHooksContext | null): void {
    this.hooksCtx = ctx || {}
  }

  setHooksRunner(runner: HooksRunner | null): void {
    this.hooksRunner = runner
  }

  pending(): McpElicitationPending[] {
    return [...this.waiters.values()].map((w) => w.meta)
  }

  /**
   * Queue an elicitation and wait for UI response.
   * Default timeout 10 minutes (user may need to open URL).
   */
  async request(
    serverName: string,
    params: ElicitRequestParams,
    opts?: { timeoutMs?: number }
  ): Promise<ElicitResult> {
    const mode = params.mode === 'url' ? 'url' : 'form'
    const message =
      typeof params.message === 'string' ? params.message : 'MCP server requests input'

    // Pre-UI Elicitation hooks — block/decline or short-circuit with action
    if (this.hooksRunner && this.hooksCtx.config) {
      try {
        const agg = await this.hooksRunner({
          event: 'Elicitation',
          config: this.hooksCtx.config,
          disabled: this.hooksCtx.disabled,
          cwd: this.hooksCtx.cwd || process.cwd(),
          input: {
            session_id: this.hooksCtx.sessionId || 'session',
            cwd: this.hooksCtx.cwd || process.cwd(),
            permission_mode: this.hooksCtx.permissionMode,
            hook_event_name: 'Elicitation',
            mcp_server_name: serverName,
            message
          }
        })
        const early = elicitationActionFromHooks(agg)
        if (early) return early
      } catch {
        /* never block elicitation on hook infra failure */
      }
    }

    const id = nanoid()
    const meta: McpElicitationPending = {
      id,
      serverName,
      message,
      mode,
      requestedSchema:
        mode === 'form' && 'requestedSchema' in params
          ? params.requestedSchema
          : undefined,
      url: mode === 'url' && 'url' in params ? String(params.url) : undefined,
      createdAt: Date.now()
    }

    this.emitFn?.({
      type: 'mcp_elicitation',
      requestId: id,
      serverName,
      message,
      mode,
      requestedSchema: meta.requestedSchema,
      url: meta.url
    })

    const timeoutMs = opts?.timeoutMs ?? 10 * 60_000
    const result = await new Promise<ElicitResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id)
        reject(new Error(`MCP elicitation timed out (${serverName})`))
      }, timeoutMs)
      this.waiters.set(id, {
        meta,
        resolve: (r) => {
          clearTimeout(timer)
          resolve(r)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      })
    })

    return this.applyElicitationResultHooks(serverName, message, result)
  }

  private async applyElicitationResultHooks(
    serverName: string,
    message: string,
    result: ElicitResult
  ): Promise<ElicitResult> {
    if (!this.hooksRunner || !this.hooksCtx.config) return result
    try {
      const action =
        result.action === 'accept' ||
        result.action === 'decline' ||
        result.action === 'cancel'
          ? result.action
          : undefined
      const agg = await this.hooksRunner({
        event: 'ElicitationResult',
        config: this.hooksCtx.config,
        disabled: this.hooksCtx.disabled,
        cwd: this.hooksCtx.cwd || process.cwd(),
        input: {
          session_id: this.hooksCtx.sessionId || 'session',
          cwd: this.hooksCtx.cwd || process.cwd(),
          permission_mode: this.hooksCtx.permissionMode,
          hook_event_name: 'ElicitationResult',
          mcp_server_name: serverName,
          message,
          action
        }
      })
      const override = elicitationActionFromHooks(agg)
      if (override) return override
    } catch {
      /* ignore */
    }
    return result
  }

  respond(requestId: string, result: ElicitResult): boolean {
    const w = this.waiters.get(requestId)
    if (!w) return false
    this.waiters.delete(requestId)
    w.resolve(result)
    return true
  }

  cancelAll(reason = 'cancelled'): number {
    const n = this.waiters.size
    for (const [id, w] of this.waiters) {
      w.reject(new Error(reason))
      this.waiters.delete(id)
    }
    return n
  }
}

export const mcpElicitationBroker = new McpElicitationBroker()
