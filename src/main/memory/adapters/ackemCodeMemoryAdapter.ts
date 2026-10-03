import { getDatabase } from '../../db/database.js'
import { ActionRepository } from '../actions/actionRepository.js'
import type {
  ActionCoordinator,
  MemoryRecordResult,
  RuntimeReceipt,
  RuntimeSnapshot
} from '../contracts.js'
import { enqueueActionReconcile } from './pluginMemoryAdapter.js'

type WorkReceipt = Extract<RuntimeReceipt, { source: 'ackemcode' }>

function fail(code: 'invalid_input' | 'invalid_transition' | 'terminal_state', message: string): MemoryRecordResult {
  return { ok: false, code, message }
}

function expectedHostRunId(receipt: WorkReceipt): string {
  return receipt.hostRunId
}

function hostConflicts(receipt: WorkReceipt): boolean {
  const trusted = receipt.trustedReceipt
  if (trusted && trusted.hostRunId !== receipt.hostRunId) return true
  return false
}

function toUnknown(
  coordinator: ActionCoordinator,
  runId: string,
  summary: string,
  at: string,
  dataRoot: string | undefined,
  errorCode?: string
): MemoryRecordResult {
  const current = coordinator.getCurrent(runId)
  if (!current) return fail('invalid_input', `unknown run: ${runId}`)
  if (current.status === 'unknown') return { ok: true, eventIds: [], duplicate: true, run: current }
  if (current.status === 'succeeded' || current.status === 'failed' || current.status === 'aborted' || current.status === 'rejected') {
    return fail('terminal_state', `run ${runId} is terminal (${current.status})`)
  }
  const moved = coordinator.transition({
    runId,
    fromVersion: current.version,
    toStatus: 'unknown',
    safeSummary: summary,
    errorCode,
    occurredAt: at,
    idempotencyKey: `work:${runId}:unknown:${summary}`
  })
  if (moved.ok && !moved.duplicate && dataRoot && moved.eventIds[0]) {
    enqueueActionReconcile(dataRoot, current.sessionId, moved.eventIds[0], at)
  }
  return moved
}

/**
 * AckemCode evidence. succeeded / failed / aborted require a persisted receipt
 * whose hostRunId matches this run. A done.ok=false without that failed receipt
 * becomes unknown and waits for reconcile. Abort request and disconnect stay unknown.
 */
export function applyAckemCodeReceipt(
  coordinator: ActionCoordinator,
  receipt: WorkReceipt,
  dataRoot?: string
): MemoryRecordResult {
  const current = coordinator.getCurrent(receipt.runId)
  if (!current) return fail('invalid_input', `unknown run: ${receipt.runId}`)
  if (current.nature !== 'work') return fail('invalid_input', 'work receipt on a non-work run')
  const expected = current.execution?.hostRunId || receipt.runId
  if (expectedHostRunId(receipt) !== expected || hostConflicts(receipt)) {
    return toUnknown(coordinator, receipt.runId, 'hostRunId does not match the persisted run', receipt.at, dataRoot, 'host_run_mismatch')
  }

  const trusted = receipt.trustedReceipt
  const event = receipt.event

  if (event.type === 'abort_requested') {
    if (dataRoot && (current.status === 'running' || current.status === 'waiting_permission' || current.status === 'unknown')) {
      const db = getDatabase(dataRoot)
      const row = db ? new ActionRepository(db).getRow(receipt.runId) : null
      if (row) enqueueActionReconcile(dataRoot, current.sessionId, row.request_event_id, receipt.at)
    }
    return { ok: true, eventIds: [], duplicate: true, run: current }
  }

  if (event.type === 'done' && event.ok === false) {
    if (!trusted || trusted.state !== 'failed' || trusted.hostRunId !== expected) {
      return toUnknown(
        coordinator,
        receipt.runId,
        'done.ok=false without a matching persisted failure receipt',
        receipt.at,
        dataRoot,
        'missing_trusted_receipt'
      )
    }
    return coordinator.reconcile({
      runId: receipt.runId,
      runtimeId: receipt.codeSessionId || receipt.runId,
      runtimeRevision: trusted.revision,
      status: 'failed',
      observedAt: trusted.updatedAt,
      errorCode: event.errorCode || trusted.errorCode || 'runtime_failed'
    })
  }

  if (event.type === 'done' && event.ok === true) {
    if (!trusted || trusted.state !== 'succeeded' || trusted.hostRunId !== expected) {
      return toUnknown(coordinator, receipt.runId, 'done.ok=true without a matching persisted receipt', receipt.at, dataRoot, 'missing_trusted_receipt')
    }
    return coordinator.reconcile({
      runId: receipt.runId,
      runtimeId: receipt.codeSessionId,
      runtimeRevision: trusted.revision,
      status: 'succeeded',
      observedAt: trusted.updatedAt
    })
  }

  if (event.type === 'waiting_permission' || trusted?.state === 'requires_action') {
    const revision = trusted?.state === 'requires_action' ? trusted.revision : undefined
    if (revision !== undefined && trusted) {
      return coordinator.reconcile({
        runId: receipt.runId,
        runtimeId: receipt.codeSessionId,
        runtimeRevision: revision,
        status: 'waiting_permission',
        observedAt: trusted.updatedAt
      })
    }
    return coordinator.transition({
      runId: receipt.runId,
      fromVersion: current.version,
      toStatus: 'waiting_permission',
      runtimeId: receipt.codeSessionId,
      safeSummary: event.type === 'waiting_permission' ? event.reason : 'waiting for permission',
      occurredAt: receipt.at,
      idempotencyKey: `work:${receipt.runId}:waiting:${current.version}`
    })
  }

  if (event.type === 'running' || trusted?.state === 'running') {
    if (current.status !== 'waiting_permission' && current.status !== 'unknown') {
      return { ok: true, eventIds: [], duplicate: true, run: current }
    }
    if (!trusted || trusted.state !== 'running' || trusted.hostRunId !== expected) {
      return toUnknown(coordinator, receipt.runId, 'resume without a matching running receipt', receipt.at, dataRoot, 'missing_trusted_receipt')
    }
    return coordinator.reconcile({
      runId: receipt.runId,
      runtimeId: receipt.codeSessionId,
      runtimeRevision: trusted.revision,
      status: 'running',
      observedAt: trusted.updatedAt
    })
  }

  if (event.type === 'aborted' || trusted?.state === 'aborted') {
    if (!trusted || trusted.state !== 'aborted' || trusted.hostRunId !== expected) {
      return toUnknown(coordinator, receipt.runId, 'abort is not confirmed by a persisted receipt', receipt.at, dataRoot, 'missing_trusted_receipt')
    }
    return coordinator.reconcile({
      runId: receipt.runId,
      runtimeId: receipt.codeSessionId,
      runtimeRevision: trusted.revision,
      status: 'aborted',
      observedAt: trusted.updatedAt,
      errorCode: trusted.errorCode
    })
  }

  if (event.type === 'unverified' && ['session_state', 'assistant_message', 'message_queued'].includes(event.reason)) {
    return { ok: true, eventIds: [], duplicate: true, run: current }
  }

  // 权限等待中的杂项流事件（token_usage/thinking/status 等，无 trusted receipt）不得把等待状态
  // 降级为 unknown：等待仍在继续，恢复由 permission allow 后的 running/done 推进。
  if (event.type === 'unverified' && !trusted && current.status === 'waiting_permission') {
    return { ok: true, eventIds: [], duplicate: true, run: current }
  }

  const reason = event.type === 'unverified' ? event.reason : event.type === 'disconnected' ? 'disconnected' : 'unverified'
  return toUnknown(coordinator, receipt.runId, reason, receipt.at, dataRoot, reason)
}

export function snapshotStatusForReceipt(
  state: NonNullable<WorkReceipt['trustedReceipt']>['state']
): RuntimeSnapshot['status'] | null {
  if (state === 'requires_action') return 'waiting_permission'
  if (state === 'running' || state === 'succeeded' || state === 'failed' || state === 'aborted') return state
  return null
}
