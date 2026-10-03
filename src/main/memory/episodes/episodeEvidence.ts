import { getDatabase } from '../../db/database.js'

/** Chat ledger event ids for one turn (production ingest / episode binding). */
export function resolveEpisodeEvidenceEventIds(
  dataRoot: string,
  sessionId: string,
  turnId: string | null | undefined
): string[] {
  if (!turnId) return []
  const db = getDatabase(dataRoot)
  if (!db) return []
  return (
    db
      .prepare(
        `SELECT event_id FROM memory_events
         WHERE session_id = ? AND turn_id = ? AND nature = 'chat'
         ORDER BY observed_at ASC, event_id ASC`
      )
      .all(sessionId, turnId) as Array<{ event_id: string }>
  ).map((r) => r.event_id)
}

export function sessionTurnHasTrustedWorkTerminal(
  dataRoot: string,
  sessionId: string,
  turnId: string
): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const row = db
    .prepare(
      `SELECT 1 FROM memory_events
       WHERE session_id = ? AND turn_id = ?
         AND event_type IN ('work.succeeded', 'plugin.succeeded')
         AND evidence_kind = 'runtime_receipt'
       LIMIT 1`
    )
    .get(sessionId, turnId)
  return Boolean(row)
}
