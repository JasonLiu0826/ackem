import type {
  AggregatedHookResult,
  HookPermissionDecision,
  SingleHookResult,
  SyncHookJson
} from './types.js'

const RANK: Record<HookPermissionDecision, number> = {
  deny: 3,
  ask: 2,
  allow: 1
}

function mergePermission(
  a?: HookPermissionDecision,
  b?: HookPermissionDecision
): HookPermissionDecision | undefined {
  if (!a) return b
  if (!b) return a
  return RANK[a] >= RANK[b] ? a : b
}

/**
 * Aggregate parallel hook results — deny > ask > allow (CC spirit).
 */
export function aggregateHookResults(
  results: SingleHookResult[]
): AggregatedHookResult {
  let blocking = false
  let blockMessage = ''
  let permissionDecision: HookPermissionDecision | undefined
  let permissionDecisionReason = ''
  let updatedInput: Record<string, unknown> | undefined
  const additionalContext: string[] = []
  let preventContinuation = false
  let stopReason: string | undefined
  let permissionAuto: AggregatedHookResult['permissionAuto']
  let initialUserMessage: string | undefined
  let permissionDeniedRetry: boolean | undefined
  const watchPaths: string[] = []
  let worktreePath: string | undefined

  for (const r of results) {
    if (r.blocking) {
      blocking = true
      if (!blockMessage) {
        blockMessage =
          r.blockMessage ||
          r.stderr.trim() ||
          r.json?.reason ||
          'Hook blocked'
      }
    }
    const json = r.json
    if (!json) {
      // exit 0 plain stdout can be context for Post/Stop/PreCompact/SessionStart
      // WorktreeCreate: stdout = absolute worktree path
      if (r.exitCode === 0 && r.stdout.trim() && !r.blocking) {
        const line = r.stdout.trim().split(/\r?\n/).find((l) => l.trim())
        if (line && (line.startsWith('/') || /^[A-Za-z]:[\\/]/.test(line))) {
          worktreePath = line.trim()
        }
        additionalContext.push(r.stdout.trim())
      }
      continue
    }
    if (json.continue === false) {
      preventContinuation = true
      stopReason = json.stopReason || json.reason || stopReason
    }
    if (json.decision === 'block') {
      blocking = true
      if (!blockMessage) {
        blockMessage = json.reason || json.stopReason || 'Hook blocked'
      }
    }
    if (typeof json.initialUserMessage === 'string' && json.initialUserMessage.trim()) {
      initialUserMessage = json.initialUserMessage.trim()
    }
    if (json.systemMessage?.trim()) {
      additionalContext.push(json.systemMessage.trim())
    }
    const hso = json.hookSpecificOutput as SyncHookJson['hookSpecificOutput']
    if (hso && typeof hso === 'object') {
      const o = hso as Record<string, unknown>
      if (typeof o.additionalContext === 'string' && o.additionalContext.trim()) {
        additionalContext.push(o.additionalContext.trim())
      }
      if (
        o.permissionDecision === 'allow' ||
        o.permissionDecision === 'deny' ||
        o.permissionDecision === 'ask'
      ) {
        permissionDecision = mergePermission(
          permissionDecision,
          o.permissionDecision
        )
        if (typeof o.permissionDecisionReason === 'string') {
          permissionDecisionReason = o.permissionDecisionReason
        }
      }
      if (
        o.updatedInput &&
        typeof o.updatedInput === 'object' &&
        !Array.isArray(o.updatedInput)
      ) {
        updatedInput = {
          ...(updatedInput ?? {}),
          ...(o.updatedInput as Record<string, unknown>)
        }
      }
      if (o.decision && typeof o.decision === 'object') {
        const d = o.decision as {
          behavior?: string
          updatedInput?: Record<string, unknown>
          message?: string
          interrupt?: boolean
        }
        if (d.behavior === 'allow') {
          permissionAuto = {
            behavior: 'allow',
            updatedInput: d.updatedInput
          }
          permissionDecision = mergePermission(permissionDecision, 'allow')
        } else if (d.behavior === 'deny') {
          permissionAuto = {
            behavior: 'deny',
            message: d.message,
            interrupt: d.interrupt
          }
          permissionDecision = mergePermission(permissionDecision, 'deny')
          blocking = true
          blockMessage = d.message || blockMessage || 'PermissionRequest hook denied'
        }
      }
      if (o.retry === true) {
        permissionDeniedRetry = true
      }
      if (Array.isArray(o.watchPaths)) {
        for (const p of o.watchPaths) {
          if (typeof p === 'string' && p.trim()) watchPaths.push(p.trim())
        }
      }
      if (typeof o.worktreePath === 'string' && o.worktreePath.trim()) {
        worktreePath = o.worktreePath.trim()
      }
    }
    // Legacy decision approve
    if (json.decision === 'approve') {
      permissionDecision = mergePermission(permissionDecision, 'allow')
    }
  }

  return {
    blocking,
    blockMessage,
    permissionDecision,
    permissionDecisionReason,
    updatedInput,
    additionalContext,
    preventContinuation,
    stopReason,
    initialUserMessage,
    permissionAuto,
    permissionDeniedRetry,
    watchPaths: [...new Set(watchPaths)],
    worktreePath,
    results
  }
}
