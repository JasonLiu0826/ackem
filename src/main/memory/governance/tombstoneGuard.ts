import type Database from 'better-sqlite3'
import { loadTombstoneIndex, isFactTombstoned } from './tombstoneIndex.js'
import type { DerivedFactCandidate } from '../semantic/types.js'

export function isInsertBlockedByTombstone(db: Database.Database, factId: string): boolean {
  return isFactTombstoned(loadTombstoneIndex(db), factId)
}

export function filterDerivedCandidatesByTombstones(
  db: Database.Database | null,
  candidates: DerivedFactCandidate[]
): DerivedFactCandidate[] {
  if (!db || candidates.length === 0) return candidates
  const tomb = loadTombstoneIndex(db)
  return candidates.filter(
    (c) => !c.evidenceEventIds.some((eventId) => tomb.events.has(eventId))
  )
}

export function tombstoneEvidenceEvents(
  db: Database.Database,
  insert: (row: {
    tombstone_id: string
    scope_type: 'event'
    scope_id: string
    reason: string
    created_at: string
    control_event_id: string
  }) => void,
  eventIds: string[],
  reason: string,
  controlEventId: string,
  at: string,
  randomId: () => string
): void {
  for (const eventId of eventIds) {
    insert({
      tombstone_id: randomId(),
      scope_type: 'event',
      scope_id: eventId,
      reason,
      created_at: at,
      control_event_id: controlEventId
    })
  }
}
