import type { MemoryEventPayload } from '../contracts.js'

import type { EventRepository } from '../ledger/eventRepository.js'



/** Persisted on reconcile/runtime events — avoids new schema column (Task 5 decision). */

export type RuntimeRevisionCursor = {

  runtimeRevision: number

  runtimeObservedAt: string | null

}



export function runtimeCursorFromPayload(payload: MemoryEventPayload): RuntimeRevisionCursor | null {

  const rev = payload.content.runtimeRevision

  if (typeof rev !== 'number' || !Number.isFinite(rev)) return null

  const observed =

    typeof payload.content.runtimeObservedAt === 'string'

      ? payload.content.runtimeObservedAt

      : null

  return { runtimeRevision: rev, runtimeObservedAt: observed }

}



/** Max runtime revision for a run. Scans that run's receipt payloads, not a capped correlation page. */

export function resolveMaxRuntimeRevisionCursor(

  events: EventRepository,

  correlationId: string,

  runId: string

): RuntimeRevisionCursor | null {

  return events.maxRuntimeRevisionCursor(correlationId, runId)

}



export function compareRuntimeSnapshot(

  cursor: RuntimeRevisionCursor | null,

  snapshot: { runtimeRevision: number; observedAt: string }

): 'apply' | 'duplicate' | 'stale' {

  if (!cursor) return 'apply'

  if (snapshot.runtimeRevision < cursor.runtimeRevision) return 'duplicate'

  if (snapshot.runtimeRevision === cursor.runtimeRevision) return 'duplicate'

  if (

    cursor.runtimeObservedAt &&

    snapshot.observedAt < cursor.runtimeObservedAt

  ) {

    return 'stale'

  }

  return 'apply'

}


