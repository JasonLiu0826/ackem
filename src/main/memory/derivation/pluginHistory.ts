import type Database from 'better-sqlite3'

import type { MemoryEvent } from '../contracts.js'

export function buildRunTargetIndex(events: MemoryEvent[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const e of events) {
    const runId = typeof e.payload.content.runId === 'string' ? e.payload.content.runId : null
    const targetId = typeof e.payload.content.targetId === 'string' ? e.payload.content.targetId : null
    if (runId && targetId) index.set(runId, targetId)
  }
  return index
}

/** Authoritative run → target mapping from action projection (Task 11). */
export function buildRunTargetIndexFromActionRuns(db: Database.Database, sessionId: string): Map<string, string> {
  const index = new Map<string, string>()
  const rows = db
    .prepare(
      `SELECT run_id, target_id FROM memory_action_runs
       WHERE session_id = ? AND target_id IS NOT NULL AND target_id != ''`
    )
    .all(sessionId) as Array<{ run_id: string; target_id: string }>
  for (const row of rows) {
    index.set(row.run_id, row.target_id)
  }
  return index
}

export function targetIdFromPluginSuccess(
  e: MemoryEvent,
  runTargetIndex: Map<string, string>
): string | null {
  if (typeof e.payload.content.targetId === 'string') return e.payload.content.targetId
  const runId = typeof e.payload.content.runId === 'string' ? e.payload.content.runId : null
  if (runId && runTargetIndex.has(runId)) return runTargetIndex.get(runId)!
  return null
}

export function priorPluginSuccessCountsExcludingBatch(
  allEvents: MemoryEvent[],
  batchEventIds: ReadonlySet<string>
): Map<string, number> {
  const prior = new Map<string, number>()
  const runTargetIndex = buildRunTargetIndex(allEvents)
  for (const e of allEvents) {
    if (e.meta.eventType !== 'plugin.succeeded') continue
    if (batchEventIds.has(e.meta.eventId)) continue
    const tid = targetIdFromPluginSuccess(e, runTargetIndex)
    if (!tid) continue
    prior.set(tid, (prior.get(tid) ?? 0) + 1)
  }
  return prior
}

/** Prior plugin.succeeded counts by resolved target (run/target join); excludes current batch event ids. */
export function priorPluginSuccessCountsForSession(
  db: Database.Database,
  sessionId: string,
  batchEventIds: ReadonlySet<string>
): Map<string, number> {
  const prior = new Map<string, number>()
  const batch = [...batchEventIds]
  let sql = `
    SELECT
      COALESCE(
        NULLIF(TRIM(json_extract(p.content_json, '$.targetId')), ''),
        ar.target_id
      ) AS target_id,
      COUNT(*) AS c
    FROM memory_events e
    JOIN memory_event_payloads p ON p.event_id = e.event_id
    LEFT JOIN memory_action_runs ar
      ON ar.run_id = json_extract(p.content_json, '$.runId')
     AND ar.session_id = e.session_id
    WHERE e.session_id = ?
      AND e.event_type = 'plugin.succeeded'
  `
  const params: unknown[] = [sessionId]
  if (batch.length > 0) {
    sql += ` AND e.event_id NOT IN (${batch.map(() => '?').join(',')})`
    params.push(...batch)
  }
  sql += `
    GROUP BY target_id
    HAVING target_id IS NOT NULL AND target_id != ''
  `
  const rows = db.prepare(sql).all(...params) as Array<{ target_id: string; c: number }>
  for (const row of rows) {
    prior.set(row.target_id, row.c)
  }
  return prior
}
