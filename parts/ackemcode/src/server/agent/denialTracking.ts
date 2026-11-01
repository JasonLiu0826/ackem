/**
 * Denial tracking — Claude Code denialTracking spirit.
 * After enough consecutive/total auto-classifier denials, fall back to prompting.
 */

export type DenialTrackingState = {
  consecutiveDenials: number
  totalDenials: number
}

export const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20
} as const

export function createDenialTrackingState(): DenialTrackingState {
  return { consecutiveDenials: 0, totalDenials: 0 }
}

export function recordDenial(state: DenialTrackingState): DenialTrackingState {
  return {
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1
  }
}

export function recordSuccess(state: DenialTrackingState): DenialTrackingState {
  if (state.consecutiveDenials === 0) return state
  return { ...state, consecutiveDenials: 0 }
}

export function shouldFallbackToPrompting(state: DenialTrackingState): boolean {
  return (
    state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive ||
    state.totalDenials >= DENIAL_LIMITS.maxTotal
  )
}

/**
 * Apply a classifier deny/allow to tracking. Returns next state and whether
 * the deny should be upgraded to ask (human prompt).
 */
export function applyClassifierDenialOutcome(
  state: DenialTrackingState,
  outcome: 'deny' | 'allow' | 'ask'
): { state: DenialTrackingState; fallbackToAsk: boolean } {
  if (outcome === 'allow') {
    return { state: recordSuccess(state), fallbackToAsk: false }
  }
  if (outcome === 'ask') {
    // Human already in the loop — reset consecutive streak
    return { state: recordSuccess(state), fallbackToAsk: false }
  }
  const next = recordDenial(state)
  return {
    state: next,
    fallbackToAsk: shouldFallbackToPrompting(next)
  }
}
