/**
 * K2 — fixed pre-model compact order (CC query.ts spirit, Ackem-owned).
 * budget → collapse read/search → micro/full → optional one-shot snip of oldest tools.
 */
import type { ChatMessage, EffortLevel } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { runFullContextCollapse } from './contextCollapseFull.js'
import type { ContextCollapseCommit } from './contextCollapseCommits.js'
import {
  getAutoCompactThreshold,
  maybeCompactMessagesAsync,
  type CompactResult
} from './compact.js'
import {
  createContentReplacementState,
  enforceToolResultBudget,
  type ContentReplacementState
} from './toolResultStorage.js'
import { estimateMessagesTokens } from './estimate.js'
import { isAutoCompactCircuitOpen, type AutoCompactTrackingState } from './autoCompact.js'

export type CompactPipelineStep =
  | 'budget'
  | 'collapse'
  | 'micro'
  | 'full'
  | 'snip'
  | 'force-full'

export type CompactPipelineResult = {
  messages: ChatMessage[]
  steps: CompactPipelineStep[]
  compact: CompactResult
  snipped: boolean
  collapseCommits?: ContextCollapseCommit[]
}

const lastStepsBySession = new Map<string, CompactPipelineStep[]>()

export function getLastCompactPipelineSteps(sessionId?: string): CompactPipelineStep[] {
  if (!sessionId) return []
  return lastStepsBySession.get(sessionId) ?? []
}

export function formatCompactPipelineLine(sessionId?: string): string {
  const steps = getLastCompactPipelineSteps(sessionId)
  if (!steps.length) return '本轮压缩: （尚未跑）'
  return `本轮压缩: ${steps.join(' → ')}`
}

/** Drop the oldest completed assistant+tool group (keep latest user + compact summaries). */
export function snipOldestToolGroup(messages: ChatMessage[]): {
  messages: ChatMessage[]
  removed: number
} {
  let firstToolIdx = -1
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!
    if (m.role === 'tool') {
      firstToolIdx = i
      break
    }
  }
  if (firstToolIdx < 0) return { messages, removed: 0 }

  let start = firstToolIdx
  while (start > 0 && messages[start - 1]!.role === 'assistant') start -= 1

  let end = firstToolIdx
  while (end + 1 < messages.length && messages[end + 1]!.role === 'tool') {
    end += 1
  }

  const keepTailUser = [...messages].reverse().findIndex((m) => m.role === 'user')
  const lastUserAbs = keepTailUser >= 0 ? messages.length - 1 - keepTailUser : -1
  if (lastUserAbs >= 0 && start <= lastUserAbs && lastUserAbs <= end) {
    return { messages, removed: 0 }
  }

  const removed = end - start + 1
  const next = [...messages.slice(0, start), ...messages.slice(end + 1)]
  if (next.length < 2) return { messages, removed: 0 }
  return { messages: next, removed }
}

export async function runCompactPipeline(opts: {
  messages: ChatMessage[]
  cwd?: string
  sessionId?: string
  forceFull?: boolean
  replacementState?: ContentReplacementState
  tracking?: AutoCompactTrackingState
  llm?: {
    apiBaseUrl: string
    apiKey: string
    model: string
    effort?: string
  }
  model?: string
  settingsContextWindow?: number
  signal?: AbortSignal
  sessionSummary?: string
  allowSnipOnce?: boolean
  onCollapseCommits?: (commits: ContextCollapseCommit[]) => void
}): Promise<CompactPipelineResult> {
  const steps: CompactPipelineStep[] = []
  const replacementState = opts.replacementState ?? createContentReplacementState()
  let working = opts.messages

  if (opts.cwd) {
    const budgeted = await enforceToolResultBudget(working, replacementState, {
      cwd: opts.cwd,
      sessionId: opts.sessionId
    })
    working = budgeted.messages
    if (budgeted.newlyReplaced > 0 || budgeted.reapplied > 0) steps.push('budget')
  }

  const collapsed = runFullContextCollapse(working)
  working = collapsed.messages
  if (collapsed.collapsedCount > 0 || collapsed.turnGroupsCollapsed > 0) {
    steps.push('collapse')
  }
  if (collapsed.commits.length) {
    opts.onCollapseCommits?.(collapsed.commits)
  }

  const compact = await maybeCompactMessagesAsync(working, {
    forceFull: opts.forceFull,
    llm: opts.llm
      ? {
          apiBaseUrl: opts.llm.apiBaseUrl,
          apiKey: opts.llm.apiKey,
          model: opts.llm.model,
          effort: (opts.llm.effort || 'medium') as EffortLevel
        }
      : undefined,
    model: opts.model || opts.llm?.model,
    settingsContextWindow: opts.settingsContextWindow,
    signal: opts.signal,
    cwd: opts.cwd,
    sessionId: opts.sessionId,
    tracking: opts.tracking,
    replacementState,
    sessionSummary: opts.sessionSummary
  })
  working = compact.messages
  if (compact.kind === 'micro') steps.push('micro')
  if (compact.kind === 'full') steps.push(opts.forceFull ? 'force-full' : 'full')

  let snipped = false
  const threshold = getAutoCompactThreshold(
    opts.model || opts.llm?.model,
    opts.settingsContextWindow
  )
  const stillHot =
    estimateMessagesTokens(working) >= threshold ||
    (opts.tracking != null && isAutoCompactCircuitOpen(opts.tracking))
  if (opts.allowSnipOnce !== false && stillHot && !opts.forceFull) {
    const cut = snipOldestToolGroup(working)
    if (cut.removed > 0) {
      working = cut.messages
      snipped = true
      steps.push('snip')
      const again = await maybeCompactMessagesAsync(working, {
        forceFull: true,
        llm: opts.llm
          ? {
              apiBaseUrl: opts.llm.apiBaseUrl,
              apiKey: opts.llm.apiKey,
              model: opts.llm.model,
              effort: (opts.llm.effort || 'medium') as EffortLevel
            }
          : undefined,
        model: opts.model || opts.llm?.model,
        settingsContextWindow: opts.settingsContextWindow,
        signal: opts.signal,
        cwd: opts.cwd,
        sessionId: opts.sessionId,
        tracking: opts.tracking,
        replacementState,
        sessionSummary: opts.sessionSummary
      })
      working = again.messages
      if (again.kind === 'full') steps.push('force-full')
      if (opts.sessionId) lastStepsBySession.set(opts.sessionId, steps)
      return {
        messages: working,
        steps,
        compact: again,
        snipped,
        collapseCommits: collapsed.commits.length ? collapsed.commits : undefined
      }
    }
  }

  if (opts.sessionId) lastStepsBySession.set(opts.sessionId, steps)
  return {
    messages: working,
    steps,
    compact,
    snipped,
    collapseCommits: collapsed.commits.length ? collapsed.commits : undefined
  }
}

export function looksLikeCompactSummary(content: string): boolean {
  return /context compacted|conversation summary|\[compact\]/i.test(
    flattenMessageContent(content).slice(0, 200)
  )
}
