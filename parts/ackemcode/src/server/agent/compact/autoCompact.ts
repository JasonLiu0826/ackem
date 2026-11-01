/**
 * Autocompact circuit breaker — Claude Code services/compact/autoCompact.ts spirit.
 */

/** Stop retrying autocompact after this many consecutive failures (CC = 3). */
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3

export type AutoCompactTrackingState = {
  /** Consecutive autocompact failures. Reset on success. */
  consecutiveFailures: number
}

export function createAutoCompactTracking(): AutoCompactTrackingState {
  return { consecutiveFailures: 0 }
}

export function isAutoCompactCircuitOpen(
  tracking: AutoCompactTrackingState | undefined
): boolean {
  return (
    (tracking?.consecutiveFailures ?? 0) >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
  )
}

export function isAutoCompactEnabled(): boolean {
  if (process.env.ACKEM_DISABLE_COMPACT === '1') return false
  if (process.env.DISABLE_COMPACT === '1') return false
  if (process.env.ACKEM_DISABLE_AUTO_COMPACT === '1') return false
  if (process.env.DISABLE_AUTO_COMPACT === '1') return false
  return true
}

export function noteAutoCompactSuccess(
  tracking: AutoCompactTrackingState
): void {
  tracking.consecutiveFailures = 0
}

export function noteAutoCompactFailure(
  tracking: AutoCompactTrackingState
): number {
  tracking.consecutiveFailures += 1
  return tracking.consecutiveFailures
}
