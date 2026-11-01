/**
 * Autocompact orchestration — micro → full, with circuit breaker +
 * cache-stable tool result storage (CC autoCompact + toolResultStorage spirit).
 */
import type { ChatMessage, EffortLevel } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { estimateMessagesTokens } from './estimate.js'
import { microCompactMessages } from './microCompact.js'
import { collapseReadSearchMessages } from './collapseReadSearch.js'
import { buildExtractiveSummary, wrapCompactSummary } from './summarize.js'
import { buildLlmSummary } from './llmSummarize.js'
import {
  isAutoCompactCircuitOpen,
  isAutoCompactEnabled,
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  type AutoCompactTrackingState
} from './autoCompact.js'
import {
  createContentReplacementState,
  enforceToolResultBudget,
  type ContentReplacementState
} from './toolResultStorage.js'
import { splitForFullCompact } from './grouping.js'
import {
  DEFAULT_COMPACT_BUFFER_TOKENS,
  DEFAULT_COMPACT_TOKEN_THRESHOLD
} from './compactConstants.js'
import {
  compactThresholdFromWindow,
  matchModelContextWindow,
  resolveContextWindowInfo
} from './contextWindow.js'

/** Keep this many newest non-system messages after full compact */
export const DEFAULT_KEEP_RECENT_MESSAGES = 12

export {
  DEFAULT_COMPACT_TOKEN_THRESHOLD,
  DEFAULT_COMPACT_BUFFER_TOKENS
} from './compactConstants.js'

export function getModelContextWindow(model?: string): number | undefined {
  return matchModelContextWindow(model)?.window
}

/**
 * R3 contract 4: dynamic autocompact threshold = model window − buffer
 * (CC getAutoCompactThreshold spirit). Unknown model → 90k fallback.
 */
export function getAutoCompactThreshold(
  model?: string,
  settingsContextWindow?: number
): number {
  return resolveContextWindowInfo({ settingsContextWindow, model }).compactThreshold
}

/**
 * Resolve compact threshold. Priority: explicit > env override
 * (`ACKEM_COMPACT_TOKEN_THRESHOLD`) > window chain (settings / env / prefix) > 90k.
 */
export function resolveCompactTokenThreshold(
  explicit?: number,
  model?: string,
  settingsContextWindow?: number
): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit
  }
  const env = process.env.ACKEM_COMPACT_TOKEN_THRESHOLD
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return resolveContextWindowInfo({ settingsContextWindow, model }).compactThreshold
}

export type CompactKind = 'none' | 'micro' | 'full'

export type CompactResult = {
  messages: ChatMessage[]
  kind: CompactKind
  beforeTokens: number
  afterTokens: number
  truncatedToolResults: number
  summaryPreview?: string
  summaryVia?: 'llm' | 'extractive' | 'session_memory'
  /** Updated failure count for session tracking */
  consecutiveFailures?: number
  /** True when circuit breaker skipped work */
  circuitOpen?: boolean
  persistedToolResults?: number
}

export type CompactOpts = {
  tokenThreshold?: number
  /** R3: model id for dynamic window-based threshold (falls back to llm.model). */
  model?: string
  /** A-09 / B-08: settings.contextWindow wins over prefix/env. */
  settingsContextWindow?: number
  microFraction?: number
  keepRecentMessages?: number
  keepRecentToolResults?: number
  forceFull?: boolean
  /** When set, full compact prefers LLM summary */
  llm?: {
    apiBaseUrl: string
    apiKey: string
    model: string
    effort?: EffortLevel
  }
  signal?: AbortSignal
  /** Circuit breaker: skip LLM after N consecutive LLM failures */
  llmFailCount?: number
  /** Session autocompact failure tracking (CC AutoCompactTrackingState) */
  tracking?: AutoCompactTrackingState
  /** Cache-stable tool result replacements */
  replacementState?: ContentReplacementState
  cwd?: string
  sessionId?: string
  /**
   * R4 SM-compact: maintained session summary. When present, full compact first
   * tries pruning with this summary (no LLM call); only falls back to LLM when
   * the prune doesn't get under threshold (CC trySessionMemoryCompaction order).
   */
  sessionSummary?: string | null
}

function splitSystem(messages: ChatMessage[]): {
  system: ChatMessage[]
  rest: ChatMessage[]
} {
  const system: ChatMessage[] = []
  const rest: ChatMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') system.push(m)
    else rest.push(m)
  }
  return { system, rest }
}

/** Sync extractive path (tests / no LLM). Never throws (GM-COMPACT). */
export function maybeCompactMessages(
  messages: ChatMessage[],
  opts: CompactOpts = {}
): CompactResult {
  try {
    return maybeCompactMessagesInner(messages, opts)
  } catch (e) {
    const t = estimateMessagesTokens(messages)
    return {
      messages,
      kind: 'none',
      beforeTokens: t,
      afterTokens: t,
      truncatedToolResults: 0,
      consecutiveFailures:
        (opts.tracking?.consecutiveFailures ?? 0) + 1,
      summaryPreview: `compact error (fail-soft): ${
        e instanceof Error ? e.message : String(e)
      }`
    }
  }
}

function maybeCompactMessagesInner(
  messages: ChatMessage[],
  opts: CompactOpts = {}
): CompactResult {
  if (!isAutoCompactEnabled() && !opts.forceFull) {
    const t = estimateMessagesTokens(messages)
    return {
      messages,
      kind: 'none',
      beforeTokens: t,
      afterTokens: t,
      truncatedToolResults: 0
    }
  }

  if (isAutoCompactCircuitOpen(opts.tracking) && !opts.forceFull) {
    const t = estimateMessagesTokens(messages)
    return {
      messages,
      kind: 'none',
      beforeTokens: t,
      afterTokens: t,
      truncatedToolResults: 0,
      circuitOpen: true,
      consecutiveFailures: opts.tracking?.consecutiveFailures
    }
  }

  const threshold = resolveCompactTokenThreshold(
    opts.tokenThreshold,
    opts.model ?? opts.llm?.model,
    opts.settingsContextWindow
  )
  const microFrac = opts.microFraction ?? 0.45
  const keepRecent = opts.forceFull
    ? Math.min(opts.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES, 4)
    : (opts.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES)
  const beforeTokens = estimateMessagesTokens(messages)

  let working = messages
  let truncatedToolResults = 0
  let kind: CompactKind = 'none'

  const collapsed = collapseReadSearchMessages(working)
  if (collapsed.collapsedCount > 0) {
    working = collapsed.messages
  }

  const needMicro =
    opts.forceFull || beforeTokens >= Math.floor(threshold * microFrac)
  if (needMicro) {
    const micro = microCompactMessages(working, {
      keepRecentToolResults: opts.keepRecentToolResults
    })
    working = micro.messages
    truncatedToolResults = micro.truncatedCount
    if (truncatedToolResults > 0) kind = 'micro'
  }

  const midTokens = estimateMessagesTokens(working)
  const needFull = opts.forceFull || midTokens >= threshold
  let failures = opts.tracking?.consecutiveFailures ?? 0

  if (needFull) {
    const { system, rest } = splitSystem(working)
    const { head, tail } = splitForFullCompact(rest, keepRecent)
    if (head.length >= 2) {
      const summary = wrapCompactSummary(buildExtractiveSummary(head))
      const summaryMsg: ChatMessage = { role: 'user', content: summary }
      const ack: ChatMessage = {
        role: 'assistant',
        content:
          'Understood. I will continue from the compacted summary above, re-reading files when details are missing.'
      }
      working = [...system, summaryMsg, ack, ...tail]
      kind = 'full'
      const afterTry = estimateMessagesTokens(working)
      if (afterTry >= threshold && !opts.forceFull) {
        failures += 1
      } else {
        failures = 0
      }
    } else if (midTokens >= threshold) {
      // Needed full but cannot shrink further
      failures += 1
    }
  }

  const afterTokens = estimateMessagesTokens(working)
  return {
    messages: working,
    kind,
    beforeTokens,
    afterTokens,
    truncatedToolResults,
    consecutiveFailures: failures,
    summaryVia: kind === 'full' ? 'extractive' : undefined,
    summaryPreview:
      kind === 'full'
        ? flattenMessageContent(
            working.find(
              (m) =>
                m.role === 'user' &&
                flattenMessageContent(m.content).startsWith('[Context compacted]')
            )?.content ?? null
          ).slice(0, 400)
        : undefined
  }
}

/**
 * Async compact — persist large tool results, micro, then full (LLM when able).
 * Never throws (GM-COMPACT fail-soft).
 */
export async function maybeCompactMessagesAsync(
  messages: ChatMessage[],
  opts: CompactOpts = {}
): Promise<CompactResult> {
  try {
    return await maybeCompactMessagesAsyncInner(messages, opts)
  } catch (e) {
    const t = estimateMessagesTokens(messages)
    return {
      messages,
      kind: 'none',
      beforeTokens: t,
      afterTokens: t,
      truncatedToolResults: 0,
      consecutiveFailures: (opts.tracking?.consecutiveFailures ?? 0) + 1,
      summaryPreview: `compact error (fail-soft): ${
        e instanceof Error ? e.message : String(e)
      }`
    }
  }
}

async function maybeCompactMessagesAsyncInner(
  messages: ChatMessage[],
  opts: CompactOpts = {}
): Promise<CompactResult> {
  if (!isAutoCompactEnabled() && !opts.forceFull) {
    const t = estimateMessagesTokens(messages)
    return {
      messages,
      kind: 'none',
      beforeTokens: t,
      afterTokens: t,
      truncatedToolResults: 0
    }
  }

  if (isAutoCompactCircuitOpen(opts.tracking) && !opts.forceFull) {
    const t = estimateMessagesTokens(messages)
    return {
      messages,
      kind: 'none',
      beforeTokens: t,
      afterTokens: t,
      truncatedToolResults: 0,
      circuitOpen: true,
      consecutiveFailures: opts.tracking?.consecutiveFailures
    }
  }

  const threshold = resolveCompactTokenThreshold(
    opts.tokenThreshold,
    opts.model ?? opts.llm?.model,
    opts.settingsContextWindow
  )
  const microFrac = opts.microFraction ?? 0.45
  const keepRecent = opts.forceFull
    ? Math.min(opts.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES, 4)
    : (opts.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES)
  const beforeTokens = estimateMessagesTokens(messages)

  let working = messages
  let truncatedToolResults = 0
  let kind: CompactKind = 'none'
  let summaryVia: 'llm' | 'extractive' | undefined
  let persistedToolResults = 0
  let failures = opts.tracking?.consecutiveFailures ?? 0

  // Cache-stable persist / re-apply (even below threshold when any result is huge)
  const replacementState =
    opts.replacementState ?? createContentReplacementState()
  if (opts.cwd) {
    try {
      const enforced = await enforceToolResultBudget(working, replacementState, {
        cwd: opts.cwd,
        sessionId: opts.sessionId
      })
      working = enforced.messages
      persistedToolResults = enforced.newlyReplaced
      if (persistedToolResults > 0 && kind === 'none') kind = 'micro'
    } catch {
      /* persistence best-effort */
    }
  }

  const needMicro =
    opts.forceFull ||
    beforeTokens >= Math.floor(threshold * microFrac) ||
    persistedToolResults > 0
  if (needMicro) {
    const micro = microCompactMessages(working, {
      keepRecentToolResults: opts.keepRecentToolResults
    })
    working = micro.messages
    truncatedToolResults = micro.truncatedCount
    if (truncatedToolResults > 0) kind = 'micro'
  }

  const midTokens = estimateMessagesTokens(working)
  const needFull = opts.forceFull || midTokens >= threshold

  // R4 SM-compact tier: micro → session-memory prune → full LLM compact.
  // Auto path only (CC trySessionMemoryCompaction lives in autoCompactIfNeeded);
  // forceFull (manual /compact, PTL recovery) goes straight to the deeper LLM
  // compact. Uses the same safe split (never breaks tool pairs, contract 3) and
  // skips the LLM summarization call when the maintained summary suffices.
  if (needFull && !opts.forceFull && opts.sessionSummary?.trim()) {
    const { system, rest } = splitSystem(working)
    const { head, tail } = splitForFullCompact(rest, keepRecent)
    if (head.length >= 2) {
      const summaryMsg: ChatMessage = {
        role: 'user',
        content: wrapCompactSummary(opts.sessionSummary.trim())
      }
      const ack: ChatMessage = {
        role: 'assistant',
        content:
          'Understood. I will continue from the compacted summary above, re-reading files when details are missing.'
      }
      const candidate = [...system, summaryMsg, ack, ...tail]
      const candidateTokens = estimateMessagesTokens(candidate)
      if (candidateTokens < threshold) {
        return {
          messages: candidate,
          kind: 'full',
          beforeTokens,
          afterTokens: candidateTokens,
          truncatedToolResults,
          summaryVia: 'session_memory',
          consecutiveFailures: 0,
          persistedToolResults,
          summaryPreview: flattenMessageContent(summaryMsg.content).slice(0, 400)
        }
      }
      // Not enough — fall through to full LLM compact on the original working set.
    }
  }

  if (needFull) {
    const { system, rest } = splitSystem(working)
    const { head, tail } = splitForFullCompact(rest, keepRecent)
    if (head.length >= 2) {
      try {
        const allowLlm =
          opts.llm?.apiKey &&
          (opts.llmFailCount == null || opts.llmFailCount < 3)

        let body: string
        if (allowLlm && opts.llm) {
          const r = await buildLlmSummary(head, {
            ...opts.llm,
            signal: opts.signal
          })
          body = r.summary
          summaryVia = r.via
        } else {
          body = buildExtractiveSummary(head)
          summaryVia = 'extractive'
        }

        const summary = wrapCompactSummary(body)
        const summaryMsg: ChatMessage = { role: 'user', content: summary }
        const ack: ChatMessage = {
          role: 'assistant',
          content:
            'Understood. I will continue from the compacted summary above, re-reading files when details are missing.'
        }
        working = [...system, summaryMsg, ack, ...tail]
        kind = 'full'

        const afterTry = estimateMessagesTokens(working)
        // Success if we got under threshold, or forceFull made progress
        if (afterTry < threshold || (opts.forceFull && afterTry < midTokens)) {
          failures = 0
        } else {
          failures += 1
        }
      } catch {
        failures += 1
        summaryVia = undefined
      }
    } else if (midTokens >= threshold) {
      failures += 1
    }
  } else if (kind === 'micro' || persistedToolResults > 0) {
    // Micro/persist relieved pressure — do not accumulate failures
    failures = 0
  }

  const afterTokens = estimateMessagesTokens(working)
  return {
    messages: working,
    kind,
    beforeTokens,
    afterTokens,
    truncatedToolResults,
    summaryVia,
    consecutiveFailures: failures,
    persistedToolResults,
    summaryPreview:
      kind === 'full'
        ? flattenMessageContent(
            working.find(
              (m) =>
                m.role === 'user' &&
                flattenMessageContent(m.content).startsWith('[Context compacted]')
            )?.content ?? null
          ).slice(0, 400)
        : undefined
  }
}

/** Vendor "prompt too long": force-full at most this many times (K2-C). */
export const MAX_PROMPT_TOO_LONG_RETRIES = 2

export function isPromptTooLongError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('prompt is too long') ||
    m.includes('context_length') ||
    m.includes('maximum context') ||
    m.includes('context window') ||
    m.includes('too many tokens') ||
    m.includes('token limit')
  )
}

export { MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES }
