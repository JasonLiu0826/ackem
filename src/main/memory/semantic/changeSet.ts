import type { FactChangeSet } from './types.js'

export function emptyFactChangeSet(): FactChangeSet {
  return { inserted: [], updated: [], retired: [], superseded: [] }
}

export function mergeFactChangeSets(a: FactChangeSet, b: FactChangeSet): FactChangeSet {
  const uniq = (xs: string[]) => [...new Set(xs)]
  return {
    inserted: uniq([...a.inserted, ...b.inserted]),
    updated: uniq([...a.updated, ...b.updated]),
    retired: uniq([...a.retired, ...b.retired]),
    superseded: uniq([...a.superseded, ...b.superseded])
  }
}

export function noteFactChange(set: FactChangeSet, kind: keyof FactChangeSet, factId: string): void {
  if (!factId) return
  if (kind === 'inserted') {
    set.updated = set.updated.filter((id) => id !== factId)
    set.retired = set.retired.filter((id) => id !== factId)
    set.superseded = set.superseded.filter((id) => id !== factId)
    if (!set.inserted.includes(factId)) set.inserted.push(factId)
    return
  }
  if (kind === 'updated') {
    if (set.inserted.includes(factId)) return
    if (!set.updated.includes(factId)) set.updated.push(factId)
    return
  }
  if (kind === 'retired') {
    set.inserted = set.inserted.filter((id) => id !== factId)
    set.updated = set.updated.filter((id) => id !== factId)
    if (!set.retired.includes(factId)) set.retired.push(factId)
    return
  }
  if (!set.superseded.includes(factId)) set.superseded.push(factId)
}
