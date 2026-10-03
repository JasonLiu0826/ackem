import { getAssociationIndex } from '../../engineCache.js'
import type { FactChangeSet } from './types.js'

/** Invalidate association index entries touched by semantic changes. */
export function applyAssociationProjection(dataRoot: string, changeSet: FactChangeSet): void {
  const touched = [
    ...changeSet.updated,
    ...changeSet.retired,
    ...changeSet.superseded
  ]
  if (touched.length === 0) return
  getAssociationIndex(dataRoot).invalidateFacts(touched)
}
