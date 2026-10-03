export type HostTurnReceipt = {
  hostRunId: string
  state: 'running' | 'requires_action' | 'succeeded' | 'failed' | 'aborted'
  revision: number
  startedAt: string
  updatedAt: string
  completedAt?: string
  errorCode?: string
}

export type ProtocolWarning = {
  sessionId: string
  reason: 'malformed_json' | 'invalid_event'
  detail: string
}

export type AgentEvent = {
  type: string
  ok?: boolean
  error?: string
  hostRunId?: string
  hostTurnReceipt?: HostTurnReceipt
  [k: string]: unknown
}

const GUARDED = new Set([
  'session_state',
  'permission_request',
  'assistant_message',
  'abort_ack',
  'done',
  'error'
])

const RECEIPT_STATES = new Set([
  'running',
  'requires_action',
  'succeeded',
  'failed',
  'aborted'
])

export function parseHostTurnReceipt(raw: unknown): HostTurnReceipt | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.hostRunId !== 'string' || !o.hostRunId.trim()) return undefined
  if (typeof o.state !== 'string' || !RECEIPT_STATES.has(o.state)) return undefined
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

function warning(sessionId: string, reason: ProtocolWarning['reason'], detail: string): {
  ok: false
  warning: ProtocolWarning
} {
  return { ok: false, warning: { sessionId, reason, detail } }
}

/**
 * Validates the events this host acts on. Other typed events pass through.
 * Invalid shapes are warnings and must not be turned into a done.
 */
export function parseTransportEvent(
  sessionId: string,
  raw: unknown
): { ok: true; event: AgentEvent } | { ok: false; warning: ProtocolWarning } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return warning(sessionId, 'invalid_event', 'event is not an object')
  }
  const record = raw as Record<string, unknown>
  if (typeof record.type !== 'string' || !record.type) {
    return warning(sessionId, 'invalid_event', 'missing type')
  }
  switch (record.type) {
    case 'session_state':
      if (typeof record.state !== 'string' || !record.state) {
        return warning(sessionId, 'invalid_event', 'session_state.state')
      }
      return { ok: true, event: record as AgentEvent }
    case 'permission_request':
      if (typeof record.requestId !== 'string' || !record.requestId) {
        return warning(sessionId, 'invalid_event', 'permission_request.requestId')
      }
      return { ok: true, event: record as AgentEvent }
    case 'assistant_message':
      if (typeof record.text !== 'string') {
        return warning(sessionId, 'invalid_event', 'assistant_message.text')
      }
      return { ok: true, event: record as AgentEvent }
    case 'abort_ack':
      return { ok: true, event: record as AgentEvent }
    case 'done': {
      if (typeof record.ok !== 'boolean') {
        return warning(sessionId, 'invalid_event', 'done.ok')
      }
      if (record.error !== undefined && typeof record.error !== 'string') {
        return warning(sessionId, 'invalid_event', 'done.error')
      }
      const event: AgentEvent = { ...record, type: 'done', ok: record.ok }
      if (typeof record.error === 'string') event.error = record.error
      const receipt = parseHostTurnReceipt(record.hostTurnReceipt)
      if (receipt) event.hostTurnReceipt = receipt
      if (typeof record.hostRunId === 'string') event.hostRunId = record.hostRunId
      return { ok: true, event }
    }
    case 'error':
      if (typeof record.message !== 'string') {
        return warning(sessionId, 'invalid_event', 'error.message')
      }
      return { ok: true, event: record as AgentEvent }
    default:
      if (GUARDED.has(record.type)) {
        return warning(sessionId, 'invalid_event', record.type)
      }
      return { ok: true, event: record as AgentEvent }
  }
}
