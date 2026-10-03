import type Database from 'better-sqlite3'

export type TombstoneIndex = {
  facts: Set<string>
  episodes: Set<string>
  events: Set<string>
}

export function loadTombstoneIndex(db: Database.Database): TombstoneIndex {
  const rows = db
    .prepare(`SELECT scope_type, scope_id FROM memory_tombstones`)
    .all() as Array<{ scope_type: string; scope_id: string }>
  const facts = new Set<string>()
  const episodes = new Set<string>()
  const events = new Set<string>()
  for (const row of rows) {
    if (row.scope_type === 'fact') facts.add(row.scope_id)
    else if (row.scope_type === 'episode') episodes.add(row.scope_id)
    else if (row.scope_type === 'event') events.add(row.scope_id)
  }
  return { facts, episodes, events }
}

export function isFactTombstoned(index: TombstoneIndex, factId: string): boolean {
  return index.facts.has(factId)
}
