import { getDatabase } from '../../db/database.js'
import type { ActionCoordinator, MemoryRecoveryReport, RuntimeSnapshot } from '../contracts.js'
import { ActionRepository } from './actionRepository.js'

export function reconcileRuntimeSnapshots(
  coordinator: ActionCoordinator,
  snapshots: RuntimeSnapshot[]
): MemoryRecoveryReport {
  const report: MemoryRecoveryReport = {
    jobsRecovered: 0,
    actionsReconciled: 0,
    actionsUnknown: 0,
    errors: [],
  }
  for (const snap of snapshots) {
    const result = coordinator.reconcile(snap)
    if (result.ok) {
      if (!result.duplicate) report.actionsReconciled += 1
    } else {
      report.errors.push({ code: result.code, targetId: snap.runId })
    }
  }
  return report
}

/** Mark in-flight runs as unknown when no runtime snapshot is available at startup. */
export function markOrphanInFlightAsUnknown(
  dataRoot: string,
  coordinator: ActionCoordinator,
  now: string,
  opts: { excludeRunIds?: ReadonlySet<string> } = {}
): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const actions = new ActionRepository(db)
  const exclude = opts.excludeRunIds ?? new Set<string>()
  let count = 0
  const rows = db
    .prepare(
      `SELECT run_id, version FROM memory_action_runs
       WHERE status IN ('running','waiting_permission')`
    )
    .all() as Array<{ run_id: string; version: number }>

  for (const row of rows) {
    if (exclude.has(row.run_id)) continue
    const current = actions.getRow(row.run_id)
    if (!current || (current.status !== 'running' && current.status !== 'waiting_permission')) continue
    const result = coordinator.transition({
      runId: row.run_id,
      fromVersion: current.version,
      toStatus: 'unknown',
      safeSummary: 'orphan in-flight at startup',
      occurredAt: now,
      idempotencyKey: `recovery.unknown:${row.run_id}:v${current.version}`,
    })
    if (result.ok && !result.duplicate) count += 1
  }
  return count
}

export async function recoverActionProjections(
  dataRoot: string,
  opts: { coordinator: ActionCoordinator; runtimeSnapshots?: RuntimeSnapshot[]; now?: string }
): Promise<MemoryRecoveryReport> {
  const now = opts.now ?? new Date().toISOString()
  const reconciled: MemoryRecoveryReport = {
    jobsRecovered: 0,
    actionsReconciled: 0,
    actionsUnknown: 0,
    errors: [],
  }
  const acceptedRunIds = new Set<string>()
  for (const snap of opts.runtimeSnapshots ?? []) {
    const result = opts.coordinator.reconcile(snap)
    if (result.ok) {
      acceptedRunIds.add(snap.runId)
      if (!result.duplicate) reconciled.actionsReconciled += 1
    } else {
      reconciled.errors.push({ code: result.code, targetId: snap.runId })
    }
  }

  const unknown = markOrphanInFlightAsUnknown(dataRoot, opts.coordinator, now, {
    excludeRunIds: acceptedRunIds,
  })

  return {
    jobsRecovered: reconciled.jobsRecovered,
    actionsReconciled: reconciled.actionsReconciled,
    actionsUnknown: unknown + reconciled.actionsUnknown,
    errors: reconciled.errors,
  }
}
