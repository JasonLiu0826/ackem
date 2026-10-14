import type { AgentEvent } from './protocol'
import type { TrustedHostReceipt } from '../memory/contracts'

export function trustedFrom(raw: AgentEvent['hostTurnReceipt']): TrustedHostReceipt | undefined {
  if (!raw) return undefined
  return {
    hostRunId: raw.hostRunId,
    state: raw.state,
    revision: raw.revision,
    updatedAt: raw.updatedAt,
    errorCode: raw.errorCode
  }
}

export function toReceiptEvent(
  event: AgentEvent | { type: 'disconnected' } | { type: 'http_error'; message: string } | { type: 'protocol_warning'; detail: string }
): import('../memory/contracts.js').AckemCodeReceipt {
  if (event.type === 'disconnected') return { type: 'disconnected' }
  if (event.type === 'http_error' && 'message' in event) {
    return { type: 'unverified', reason: String(event.message || 'http_error') }
  }
  if (event.type === 'protocol_warning' && 'detail' in event) {
    return { type: 'unverified', reason: String(event.detail || 'bad_sse') }
  }
  if (event.type === 'permission_request') {
    const requestId = 'requestId' in event ? event.requestId : ''
    const reason = 'reason' in event ? event.reason : 'permission'
    return { type: 'waiting_permission', requestId: String(requestId ?? ''), reason: String(reason ?? 'permission') }
  }
  if (event.type === 'done' && event.ok === true) return { type: 'done', ok: true, resultSummary: '' }
  if (event.type === 'done' && event.ok === false) return { type: 'done', ok: false, errorCode: String(event.error ?? 'runtime_failed') }
  if (event.type === 'abort_ack') return { type: 'aborted' }
  return { type: 'unverified', reason: event.type }
}

