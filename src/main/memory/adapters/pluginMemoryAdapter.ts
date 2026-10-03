import { getDatabase } from '../../db/database.js'
import type { ActionCoordinator, MemoryRecordResult, RuntimeReceipt } from '../contracts.js'
import { JobRepository } from '../jobs/jobRepository.js'

type PluginReceipt = Extract<RuntimeReceipt, { source: 'plugin' }>

const RECONCILE_DERIVATION_VERSION = 1

function fail(
  code: 'invalid_input' | 'invalid_transition',
  message: string
): MemoryRecordResult {
  return { ok: false, code, message }
}

export function enqueueActionReconcile(
  dataRoot: string,
  sessionId: string,
  sourceEventId: string,
  at: string
): void {
  if (!sourceEventId) return
  const db = getDatabase(dataRoot)
  if (!db) return
  new JobRepository(db).enqueue(db, {
    job_id: `action.reconcile:${sourceEventId}`,
    source_event_id: sourceEventId,
    session_id: sessionId,
    job_type: 'action.reconcile',
    derivation_version: RECONCILE_DERIVATION_VERSION,
    status: 'pending',
    attempts: 0,
    available_at: at,
    lease_until: null,
    lease_owner: null,
    lease_generation: 0,
    last_error: null,
    created_at: at,
    updated_at: at
  })
}

/** Maps a structured plugin result onto the action run. Text alone is not success. */
export function applyPluginReceipt(
  coordinator: ActionCoordinator,
  receipt: PluginReceipt,
  dataRoot?: string
): MemoryRecordResult {
  const current = coordinator.getCurrent(receipt.runId)
  if (!current) return fail('invalid_input', `unknown run: ${receipt.runId}`)
  if (current.nature !== 'plugin') return fail('invalid_input', 'plugin receipt on a non-plugin run')
  if (current.targetId && current.targetId !== receipt.extensionId) {
    return fail('invalid_input', 'plugin extension does not match the run')
  }
  if (receipt.outcome === 'stop_failed') {
    if (current.status !== 'running' && current.status !== 'waiting_permission') {
      return fail('invalid_transition', 'stop failure requires a live plugin run')
    }
    return { ok: true, eventIds: [], duplicate: true, run: current }
  }

  if (receipt.outcome === 'unknown') {
    if (current.status === 'unknown') return { ok: true, eventIds: [], duplicate: true, run: current }
    const moved = coordinator.transition({
      runId: current.runId,
      fromVersion: current.version,
      toStatus: 'unknown',
      safeSummary: receipt.summary,
      errorCode: receipt.errorCode,
      occurredAt: receipt.at,
      idempotencyKey: `plugin:${receipt.runId}:unknown:v${current.version}`
    })
    if (moved.ok && !moved.duplicate && dataRoot && moved.eventIds[0]) {
      enqueueActionReconcile(dataRoot, current.sessionId, moved.eventIds[0], receipt.at)
    }
    return moved
  }

  if (current.status === receipt.outcome) {
    return { ok: true, eventIds: [], duplicate: true, run: current }
  }
  return coordinator.reconcile({
    runId: receipt.runId,
    // The extension ID repeats across invocations; runtime_id identifies this one run.
    runtimeId: receipt.runId,
    runtimeRevision: receipt.revision,
    status: receipt.outcome,
    observedAt: receipt.at,
    errorCode: 'errorCode' in receipt ? receipt.errorCode : undefined
  })
}
