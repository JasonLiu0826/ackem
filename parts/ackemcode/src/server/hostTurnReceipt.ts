import type { AgentEvent, HostTurnReceipt } from '../shared/types.js'

export type HostTurnSignal =
  | { kind: 'start'; hostRunId: string; at: string }
  | { kind: 'permission_wait'; at: string }
  | { kind: 'resume'; at: string }
  | { kind: 'succeeded'; at: string }
  | { kind: 'failed'; at: string; errorCode?: string }
  | { kind: 'aborted'; at: string; errorCode?: string }

const STATES = ['running', 'requires_action', 'succeeded', 'failed', 'aborted'] as const

function isTerminal(state: HostTurnReceipt['state']): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'aborted'
}

/** Missing or invalid receipts stay undefined. Never invent a terminal state. */
export function parseHostTurnReceipt(raw: unknown): HostTurnReceipt | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.hostRunId !== 'string' || !o.hostRunId.trim()) return undefined
  if (typeof o.state !== 'string' || !(STATES as readonly string[]).includes(o.state)) return undefined
  if (typeof o.revision !== 'number' || !Number.isInteger(o.revision) || o.revision < 1) return undefined
  if (typeof o.startedAt !== 'string' || !o.startedAt) return undefined
  if (typeof o.updatedAt !== 'string' || !o.updatedAt) return undefined
  const receipt: HostTurnReceipt = {
    hostRunId: o.hostRunId,
    state: o.state as HostTurnReceipt['state'],
    revision: o.revision,
    startedAt: o.startedAt,
    updatedAt: o.updatedAt
  }
  if (typeof o.completedAt === 'string' && o.completedAt) receipt.completedAt = o.completedAt
  if (typeof o.errorCode === 'string' && o.errorCode) receipt.errorCode = o.errorCode
  return receipt
}

export type DurableReceiptCommit = {
  /** Memory after the attempt. A failed write rolls back to the previous receipt. */
  receipt: HostTurnReceipt | undefined
  /** Safe to put on SSE. Absent when this transition did not reach disk. */
  trusted: HostTurnReceipt | undefined
}

export const HOST_TURN_RECEIPT_NOT_PERSISTED = 'host_turn_receipt_not_persisted'
/** Same hostRunId already has a receipt. The request must not run again. */
export const HOST_RUN_DUPLICATE = 'host_run_duplicate'

export type PublishedHostEvent = {
  receipt: HostTurnReceipt | undefined
  event: AgentEvent
  /** Close the stream after `event`. The event is never a successful done. */
  disconnect: boolean
}

/**
 * Advance a receipt only when `write` succeeds. A thrown write keeps the previous
 * receipt and yields no trusted receipt for the event that attempted the change.
 */
export async function commitDurableReceipt(
  previous: HostTurnReceipt | undefined,
  next: HostTurnReceipt | undefined,
  write: (receipt: HostTurnReceipt) => Promise<void>
): Promise<DurableReceiptCommit> {
  if (!next || next === previous) return { receipt: previous, trusted: previous }
  try {
    await write(next)
    return { receipt: next, trusted: next }
  } catch {
    return { receipt: previous, trusted: undefined }
  }
}

export type BeginHostTurnResult = {
  receipt: HostTurnReceipt | undefined
  /** True only when this call stored a new running receipt for hostRunId. */
  proceed: boolean
  reason: 'started' | 'duplicate' | 'not_persisted'
}

/**
 * Open a host run. The same hostRunId never executes twice: a running,
 * waiting, or terminal receipt rejects the repeat and is left unchanged.
 * A new id proceeds only after its running receipt is stored.
 */
/** True when this hostRunId already owns the session receipt. */
export function isSameHostRun(receipt: HostTurnReceipt | undefined, hostRunId: string): boolean {
  const id = hostRunId.trim()
  return Boolean(id && receipt?.hostRunId === id)
}

export async function beginHostTurn(
  previous: HostTurnReceipt | undefined,
  hostRunId: string,
  at: string,
  write: (receipt: HostTurnReceipt) => Promise<void>
): Promise<BeginHostTurnResult> {
  const id = hostRunId.trim()
  if (isSameHostRun(previous, id)) {
    return { receipt: previous, proceed: false, reason: 'duplicate' }
  }
  const next = applyHostTurnSignal(previous, { kind: 'start', hostRunId: id, at })
  const committed = await commitDurableReceipt(previous, next, write)
  const started = committed.trusted?.hostRunId === id && committed.trusted.state === 'running'
  return {
    receipt: committed.receipt,
    proceed: started,
    reason: started ? 'started' : 'not_persisted'
  }
}

/** Apply one agent event. A success done is sent only with a stored succeeded receipt. */
export async function publishHostEvent(
  previous: HostTurnReceipt | undefined,
  event: AgentEvent,
  at: string,
  write: (receipt: HostTurnReceipt) => Promise<void>
): Promise<PublishedHostEvent> {
  const signal = signalFromAgentEvent(event, at)
  const next = signal ? applyHostTurnSignal(previous, signal) : previous
  const committed = await commitDurableReceipt(previous, next, write)
  const successStored = committed.trusted?.state === 'succeeded'
  if (event.type === 'done' && event.ok === true && !successStored) {
    return {
      receipt: committed.receipt,
      event: { type: 'error', message: HOST_TURN_RECEIPT_NOT_PERSISTED },
      disconnect: true
    }
  }
  return {
    receipt: committed.receipt,
    event: decorateHostEvent(event, committed.trusted),
    disconnect: false
  }
}

/**
 * One revision per real state change.
 * The same hostRunId never reopens a receipt. A new task needs a new id.
 */
export function applyHostTurnSignal(
  current: HostTurnReceipt | undefined,
  signal: HostTurnSignal
): HostTurnReceipt | undefined {
  if (signal.kind === 'start') {
    const hostRunId = signal.hostRunId.trim()
    if (!hostRunId) return current
    if (current?.hostRunId === hostRunId) return current
    return {
      hostRunId,
      state: 'running',
      revision: 1,
      startedAt: signal.at,
      updatedAt: signal.at
    }
  }

  if (!current || isTerminal(current.state)) return current

  if (signal.kind === 'permission_wait') {
    if (current.state === 'requires_action') return current
    return {
      ...current,
      state: 'requires_action',
      revision: current.revision + 1,
      updatedAt: signal.at
    }
  }

  if (signal.kind === 'resume') {
    if (current.state !== 'requires_action') return current
    return {
      ...current,
      state: 'running',
      revision: current.revision + 1,
      updatedAt: signal.at
    }
  }

  if (signal.kind === 'succeeded') {
    return {
      ...current,
      state: 'succeeded',
      revision: current.revision + 1,
      updatedAt: signal.at,
      completedAt: signal.at,
      errorCode: undefined
    }
  }

  if (signal.kind === 'failed') {
    return {
      ...current,
      state: 'failed',
      revision: current.revision + 1,
      updatedAt: signal.at,
      completedAt: signal.at,
      errorCode: signal.errorCode
    }
  }

  return {
    ...current,
    state: 'aborted',
    revision: current.revision + 1,
    updatedAt: signal.at,
    completedAt: signal.at,
    errorCode: signal.errorCode ?? 'aborted'
  }
}

export function signalFromAgentEvent(event: AgentEvent, at: string): HostTurnSignal | null {
  if (event.type === 'permission_request') return { kind: 'permission_wait', at }
  if (event.type === 'abort_ack') return { kind: 'aborted', at }
  if (event.type === 'session_state' && event.state === 'running') return { kind: 'resume', at }
  if (event.type === 'done') {
    if (event.ok) return { kind: 'succeeded', at }
    if (event.error === 'aborted' || event.error === 'aborted_tools') {
      return { kind: 'aborted', at, errorCode: event.error }
    }
    return { kind: 'failed', at, errorCode: event.error }
  }
  if (
    event.type === 'assistant_delta' ||
    event.type === 'assistant_message' ||
    event.type === 'tool_start' ||
    event.type === 'tool_result'
  ) {
    return { kind: 'resume', at }
  }
  return null
}

export function decorateHostEvent(event: AgentEvent, receipt: HostTurnReceipt | undefined): AgentEvent {
  if (!receipt) return event
  if (event.type !== 'done' && event.type !== 'permission_request' && event.type !== 'abort_ack') {
    return event
  }
  return { ...event, hostRunId: receipt.hostRunId, hostTurnReceipt: { ...receipt } }
}
