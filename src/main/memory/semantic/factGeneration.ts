import type { MemoryFact } from './types.js'
import type { FactIndexPendingEntry } from './types.js'

export function factIndexRevision(fact: MemoryFact | undefined): number | null {
  if (!fact) return null
  const rev = fact.indexRevision
  return typeof rev === 'number' && rev > 0 ? rev : null
}

export function pendingEntryMatchesFact(entry: FactIndexPendingEntry, fact: MemoryFact | undefined): boolean {
  if (entry.kind === 'retired') {
    return fact === undefined || fact.status === 'retired'
  }
  if (entry.kind === 'superseded') {
    return fact === undefined
  }
  const rev = factIndexRevision(fact)
  return rev !== null && rev === entry.revision
}
