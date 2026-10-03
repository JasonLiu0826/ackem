import type { ActionStatus } from '../contracts.js'
import { ACTION_TRANSITIONS } from '../contracts.js'

export { ACTION_TRANSITIONS }

const TERMINAL: ReadonlySet<ActionStatus> = new Set([
  'succeeded',
  'failed',
  'rejected',
  'aborted',
])

export function isTerminalStatus(status: ActionStatus): boolean {
  return TERMINAL.has(status)
}

export function allowedNextStatuses(from: ActionStatus): readonly ActionStatus[] {
  return ACTION_TRANSITIONS[from] ?? []
}

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  if (from === to) return false
  return allowedNextStatuses(from).includes(to)
}

/** Runtime receipt required for these targets when leaving an in-flight state. */
export function requiresRuntimeReceipt(from: ActionStatus, to: ActionStatus): boolean {
  if (to === 'succeeded') return true
  if (to === 'failed' || to === 'aborted') {
    return from === 'running' || from === 'waiting_permission' || from === 'unknown'
  }
  return false
}

export type TransitionValidation =
  | { ok: true }
  | { ok: false; code: 'terminal_state' | 'invalid_transition' | 'missing_trusted_receipt' }

export function validateTransition(
  from: ActionStatus,
  to: ActionStatus,
  opts: { trustedReceipt: boolean }
): TransitionValidation {
  if (isTerminalStatus(from)) {
    return { ok: false, code: 'terminal_state' }
  }
  if (!canTransition(from, to)) {
    return { ok: false, code: 'invalid_transition' }
  }
  if (requiresRuntimeReceipt(from, to) && !opts.trustedReceipt) {
    return { ok: false, code: 'missing_trusted_receipt' }
  }
  return { ok: true }
}
