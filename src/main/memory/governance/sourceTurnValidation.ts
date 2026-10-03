import type Database from 'better-sqlite3'

export type SourceTurnValidation =
  | { ok: true }
  | { ok: false; code: 'source_turn_required' | 'source_turn_mismatch' }

/** Distinct ledger turn_ids linked to a fact via evidence. */
export function sourceTurnIdsForFactEvidence(db: Database.Database, factId: string): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT e.turn_id AS turn_id
       FROM memory_fact_evidence fe
       INNER JOIN memory_events e ON e.event_id = fe.event_id
       WHERE fe.fact_id = ? AND e.turn_id IS NOT NULL AND TRIM(e.turn_id) != ''`
    )
    .all(factId) as Array<{ turn_id: string }>
  return rows.map((r) => r.turn_id)
}

export function validateSourceTurnForDeleteScope(
  db: Database.Database,
  factId: string,
  turnId: string | null | undefined,
  scope: 'memory_only' | 'memory_and_source'
): SourceTurnValidation {
  if (scope !== 'memory_and_source') return { ok: true }
  const trimmed = turnId?.trim()
  if (!trimmed) return { ok: false, code: 'source_turn_required' }
  const allowed = sourceTurnIdsForFactEvidence(db, factId)
  if (allowed.length === 0 || !allowed.includes(trimmed)) {
    return { ok: false, code: 'source_turn_mismatch' }
  }
  return { ok: true }
}

export function sourceTurnIdsForEpisodeEvidence(db: Database.Database, episodeId: string): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT e.turn_id AS turn_id
       FROM memory_episode_evidence ee
       INNER JOIN memory_events e ON e.event_id = ee.event_id
       WHERE ee.episode_id = ? AND e.turn_id IS NOT NULL AND TRIM(e.turn_id) != ''`
    )
    .all(episodeId) as Array<{ turn_id: string }>
  return rows.map((r) => r.turn_id)
}

export function validateSourceTurnForEpisodeDelete(
  db: Database.Database,
  episodeId: string,
  turnId: string | null | undefined,
  scope: 'memory_only' | 'memory_and_source'
): SourceTurnValidation {
  if (scope !== 'memory_and_source') return { ok: true }
  const trimmed = turnId?.trim()
  if (!trimmed) return { ok: false, code: 'source_turn_required' }
  const allowed = sourceTurnIdsForEpisodeEvidence(db, episodeId)
  if (allowed.length === 0 || !allowed.includes(trimmed)) {
    return { ok: false, code: 'source_turn_mismatch' }
  }
  return { ok: true }
}
