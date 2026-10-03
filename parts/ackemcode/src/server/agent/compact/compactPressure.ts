/**
 * Token pressure / warning thresholds — Claude Code calculateTokenWarningState spirit.
 * Ackem-owned; no GrowthBook. Used for host status before autocompact.
 */
import {
  DEFAULT_COMPACT_BUFFER_TOKENS,
  resolveCompactTokenThreshold
} from './compact.js'
import { isAutoCompactEnabled } from './autoCompact.js'

/** Tokens below threshold that trigger a soft warning (CC WARNING_THRESHOLD_BUFFER). */
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
/** Tokens below threshold that trigger a hard warning (CC ERROR_THRESHOLD_BUFFER). */
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
/**
 * R3 contract 5: blocking level — usage within ~3k of the actual context window
 * (threshold already sits DEFAULT_COMPACT_BUFFER_TOKENS below the window, so
 * blocking = threshold + buffer − 3k). Above it, non-essential attachment
 * injection must stop.
 */
export const BLOCKING_WINDOW_MARGIN_TOKENS = 3_000

export type CompactPressureLevel =
  | 'ok'
  | 'warn'
  | 'error'
  | 'autocompact'
  | 'blocking'

export type CompactPressureState = {
  level: CompactPressureLevel
  tokenUsage: number
  threshold: number
  warningThreshold: number
  errorThreshold: number
  blockingThreshold: number
  percentRemaining: number
  isAboveWarningThreshold: boolean
  isAboveErrorThreshold: boolean
  isAboveAutoCompactThreshold: boolean
  isAboveBlockingThreshold: boolean
  autoCompactEnabled: boolean
}

/**
 * Classify context pressure for a token count vs compact threshold.
 */
export function calculateTokenWarningState(
  tokenUsage: number,
  opts?: { tokenThreshold?: number; model?: string }
): CompactPressureState {
  const autoCompactEnabled = isAutoCompactEnabled()
  const threshold = resolveCompactTokenThreshold(opts?.tokenThreshold, opts?.model)
  // Effective "full" line: threshold itself (already includes buffer vs model window)
  const warningThreshold = Math.max(
    0,
    threshold - WARNING_THRESHOLD_BUFFER_TOKENS
  )
  const errorThreshold = Math.max(0, threshold - ERROR_THRESHOLD_BUFFER_TOKENS)
  // blocking sits above the compact threshold, ~3k under the actual window
  const blockingThreshold =
    threshold + DEFAULT_COMPACT_BUFFER_TOKENS - BLOCKING_WINDOW_MARGIN_TOKENS
  // When buffers exceed threshold (small e2e thresholds), warn/error collapse to 0
  const isAboveWarningThreshold = tokenUsage >= warningThreshold
  const isAboveErrorThreshold = tokenUsage >= errorThreshold
  const isAboveAutoCompactThreshold =
    autoCompactEnabled && tokenUsage >= threshold
  const isAboveBlockingThreshold = tokenUsage >= blockingThreshold

  let level: CompactPressureLevel = 'ok'
  if (isAboveBlockingThreshold) level = 'blocking'
  else if (isAboveAutoCompactThreshold) level = 'autocompact'
  else if (isAboveErrorThreshold) level = 'error'
  else if (isAboveWarningThreshold) level = 'warn'

  const percentRemaining = Math.max(
    0,
    Math.min(100, Math.round(((threshold - tokenUsage) / threshold) * 100))
  )

  return {
    level,
    tokenUsage,
    threshold,
    warningThreshold,
    errorThreshold,
    blockingThreshold,
    percentRemaining,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAboveBlockingThreshold,
    autoCompactEnabled
  }
}

/** One-line status for SSE / doctor. */
export function formatCompactPressureStatus(state: CompactPressureState): string {
  return `context pressure=${state.level} tokens=${state.tokenUsage}/${state.threshold} (~${state.percentRemaining}% left) buffer=${DEFAULT_COMPACT_BUFFER_TOKENS}`
}
