/**
 * Post-compact cleanup — Claude Code postCompactCleanup spirit (minimal).
 * No Dream / cached microcompact / GrowthBook.
 */
import type { AutoCompactTrackingState } from './autoCompact.js'
import { noteAutoCompactSuccess } from './autoCompact.js'
import type { CompactResult } from './compact.js'

export type PostCompactCleanupOpts = {
  tracking?: AutoCompactTrackingState
  /** Module-level LLM fail counter reset on successful LLM full compact */
  resetLlmFailCount?: () => void
  summaryVia?: CompactResult['summaryVia']
  kind?: CompactResult['kind']
}

/**
 * Call after a successful compact that reduced pressure (or forceFull progress).
 * Resets circuit-breaker failures when kind is full/micro with falling tokens.
 */
export function runPostCompactCleanup(
  result: CompactResult,
  opts: PostCompactCleanupOpts = {}
): void {
  if (result.circuitOpen || result.kind === 'none') return

  if (
    opts.tracking &&
    result.afterTokens < result.beforeTokens &&
    (result.kind === 'full' || result.kind === 'micro')
  ) {
    noteAutoCompactSuccess(opts.tracking)
  }

  if (result.kind === 'full' && result.summaryVia === 'llm') {
    opts.resetLlmFailCount?.()
  }
}
