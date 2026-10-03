/**
 * Run matched hooks for an event — Claude Code executeHooks spirit.
 */
import { basename } from 'node:path'
import type {
  HooksConfig,
  HookEventName,
  HookInput,
  AggregatedHookResult
} from './types.js'
import { selectHooks } from './match.js'
import { executeHook } from './execute.js'
import { aggregateHookResults } from './merge.js'
import {
  invalidateSessionEnvCache,
  isEnvFileHookEvent,
  setSessionEnvSessionId
} from './sessionEnv.js'

const onceKeys = new Set<string>()

const TOOL_EVENTS = new Set<HookEventName>([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied'
])

export function isHooksDisabled(settingsDisabled?: boolean): boolean {
  if (settingsDisabled === true) return true
  if (process.env.ACKEM_DISABLE_ALL_HOOKS === '1') return true
  if (process.env.CLAUDE_CODE_SIMPLE === '1') return true
  return false
}

function onceKey(
  event: HookEventName,
  hook: { type: string; command?: string; url?: string }
): string {
  return `${event}:${hook.type}:${hook.command || hook.url || ''}`
}

function emptyResult(): AggregatedHookResult {
  return {
    blocking: false,
    blockMessage: '',
    additionalContext: [],
    preventContinuation: false,
    watchPaths: [],
    results: []
  }
}

/**
 * Derive match query for an event (CC getMatchingHooks spirit).
 * toolName opt overrides for tool events.
 */
export function matchQueryForEvent(
  event: HookEventName,
  input: HookInput,
  toolName?: string
): string | undefined {
  if (toolName != null && toolName !== '') return toolName
  switch (event) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionRequest':
    case 'PermissionDenied':
      return 'tool_name' in input ? String(input.tool_name) : undefined
    case 'FileChanged':
      return 'file_path' in input && typeof input.file_path === 'string'
        ? basename(input.file_path)
        : undefined
    case 'ConfigChange':
      return 'source' in input ? String(input.source) : undefined
    case 'InstructionsLoaded':
      return 'load_reason' in input ? String(input.load_reason) : undefined
    case 'Elicitation':
    case 'ElicitationResult':
      return 'mcp_server_name' in input && input.mcp_server_name
        ? String(input.mcp_server_name)
        : undefined
    default:
      return undefined
  }
}

export async function runHooks(opts: {
  event: HookEventName
  config: HooksConfig | undefined
  input: HookInput
  cwd: string
  toolName?: string
  toolInput?: unknown
  /** Explicit match query (overrides toolName / derived). */
  matchQuery?: string
  signal?: AbortSignal
  /** settings.disableAllHooks */
  disabled?: boolean
}): Promise<AggregatedHookResult> {
  if (isHooksDisabled(opts.disabled) || !opts.config) return emptyResult()

  const groups = opts.config[opts.event]
  const matchQuery =
    opts.matchQuery ??
    matchQueryForEvent(opts.event, opts.input, opts.toolName)

  let hooks = selectHooks(
    groups,
    matchQuery,
    opts.toolInput ??
      (opts.input as { tool_input?: unknown }).tool_input,
    {
      applyIfCondition: TOOL_EVENTS.has(opts.event),
      toolNameForIf: opts.toolName ?? matchQuery
    }
  )

  // once: skip already-run
  hooks = hooks.filter((h) => {
    if (!h.once) return true
    const k = onceKey(opts.event, h)
    if (onceKeys.has(k)) return false
    onceKeys.add(k)
    return true
  })

  if (!hooks.length) return emptyResult()

  const sessionId =
    'session_id' in opts.input ? String(opts.input.session_id) : 'session'
  setSessionEnvSessionId(sessionId)

  const results = await Promise.all(
    hooks.map((h, i) =>
      executeHook(h, opts.input, opts.cwd, opts.signal, {
        event: opts.event,
        hookIndex: i,
        sessionId
      })
    )
  )

  if (isEnvFileHookEvent(opts.event)) {
    invalidateSessionEnvCache()
  }

  return aggregateHookResults(results)
}

/** Test helper */
export function clearOnceHooks(): void {
  onceKeys.clear()
}
