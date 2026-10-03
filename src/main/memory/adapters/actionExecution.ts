import { createHash } from 'node:crypto'
import type { ActionRun, MemoryRecordResult, NewActionRun } from '../contracts.js'

type RecordFailure = Extract<MemoryRecordResult, { ok: false }>
import type { ActionPort } from './composeMemorySystem.js'

export function stableActionRunId(parts: readonly string[]): string {
  const hex = createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32)
  return `run_${hex}`
}

export type PersistedActionOutcome =
  | { executed: true; run: ActionRun }
  | { executed: false; reason: 'not_persisted'; failure: RecordFailure; run?: ActionRun }
  | { executed: false; reason: 'duplicate' | 'queued'; run: ActionRun }

/**
 * Persist the run and its running transition before `exec`.
 * A write failure or an existing non-accepted run never calls `exec`.
 */
export async function withPersistedAction(
  port: ActionPort,
  action: NewActionRun,
  exec: (run: ActionRun) => Promise<void>
): Promise<PersistedActionOutcome> {
  const existing = port.getAction(action.runId)
  if (existing && existing.status !== 'accepted') {
    return {
      executed: false,
      reason: existing.status === 'queued' ? 'queued' : 'duplicate',
      run: existing
    }
  }

  let run = existing
  if (!run) {
    const created = port.record({ kind: 'action.created', action })
    if (!created.ok || !created.run) {
      return { executed: false, reason: 'not_persisted', failure: created.ok ? { ok: false, code: 'db_unavailable', message: 'run missing after create' } : created }
    }
    run = created.run
  }

  if (run.status === 'queued' || action.initialStatus === 'queued') {
    return { executed: false, reason: 'queued', run }
  }

  const running = port.record({
    kind: 'action.transitioned',
    transition: {
      runId: run.runId,
      fromVersion: run.version,
      toStatus: 'running',
      safeSummary: action.requestSummary,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `action.start:${run.runId}:v${run.version}`
    }
  })
  if (!running.ok || !running.run) {
    return {
      executed: false,
      reason: 'not_persisted',
      failure: running.ok ? { ok: false, code: 'db_unavailable', message: 'running transition missing' } : running,
      run
    }
  }

  await exec(running.run)
  return { executed: true, run: port.getAction(run.runId) ?? running.run }
}
