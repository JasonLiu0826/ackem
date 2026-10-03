import type Database from 'better-sqlite3'
import { getDatabase } from '../database.js'
import type {
  AppliedFactIndexPendingEntry,
  FactChangeKind,
  FactChangeSet,
  FactIndexPendingEntry
} from '../../memory/semantic/types.js'
import { emptyFactChangeSet, mergeFactChangeSets } from '../../memory/semantic/changeSet.js'

const NAMESPACE = 'fact_index_pending'
const KEY = 'changes'

type StoredPendingV3 = { version: 3; entries: FactIndexPendingEntry[] }
type StoredPendingV2 = { version: 2; entries: Array<{ factId: string; kind: FactChangeKind; syncToken: string }> }

function entryKey(e: FactIndexPendingEntry): string {
  return `${e.kind}:${e.factId}:${e.revision}`
}

function dedupeEntries(entries: FactIndexPendingEntry[]): FactIndexPendingEntry[] {
  const seen = new Set<string>()
  const out: FactIndexPendingEntry[] = []
  for (const e of entries) {
    const k = entryKey(e)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

export function changeSetToEntries(changeSet: FactChangeSet, revision = 0): FactIndexPendingEntry[] {
  const out: FactIndexPendingEntry[] = []
  for (const factId of changeSet.inserted) out.push({ factId, kind: 'inserted', revision })
  for (const factId of changeSet.updated) out.push({ factId, kind: 'updated', revision })
  for (const factId of changeSet.retired) out.push({ factId, kind: 'retired', revision })
  for (const factId of changeSet.superseded) out.push({ factId, kind: 'superseded', revision })
  return out
}

function entriesToChangeSet(entries: FactIndexPendingEntry[]): FactChangeSet {
  const set = emptyFactChangeSet()
  for (const e of entries) {
    if (!set[e.kind].includes(e.factId)) set[e.kind].push(e.factId)
  }
  return set
}

function upgradeLegacyIsoToken(
  db: Database.Database,
  factId: string,
  kind: FactChangeKind,
  isoToken: string
): FactIndexPendingEntry | null {
  const row = db
    .prepare(`SELECT index_revision, updated_at FROM memory_facts WHERE id = ?`)
    .get(factId) as { index_revision: number; updated_at: string } | undefined
  if (!row) {
    if (kind === 'retired' || kind === 'superseded') {
      return { factId, kind, revision: 1 }
    }
    return null
  }
  if (row.updated_at === isoToken) {
    return { factId, kind, revision: Number(row.index_revision) || 1 }
  }
  return { factId, kind, revision: Number(row.index_revision) || 1 }
}

function parseStored(db: Database.Database, raw: string | undefined): FactIndexPendingEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StoredPendingV3 | StoredPendingV2 | (FactChangeSet & { version?: number })
    if (parsed && typeof parsed === 'object' && (parsed as StoredPendingV3).version === 3) {
      return dedupeEntries((parsed as StoredPendingV3).entries ?? [])
    }
    if (parsed && typeof parsed === 'object' && (parsed as StoredPendingV2).version === 2) {
      const upgraded: FactIndexPendingEntry[] = []
      for (const e of (parsed as StoredPendingV2).entries ?? []) {
        if (/^\d+$/.test(e.syncToken)) {
          upgraded.push({ factId: e.factId, kind: e.kind, revision: Number(e.syncToken) })
          continue
        }
        const leg = upgradeLegacyIsoToken(db, e.factId, e.kind, e.syncToken)
        if (leg) upgraded.push(leg)
      }
      return dedupeEntries(upgraded)
    }
    const legacy = parsed as FactChangeSet
    const fromSet = changeSetToEntries({
      inserted: legacy.inserted ?? [],
      updated: legacy.updated ?? [],
      retired: legacy.retired ?? [],
      superseded: legacy.superseded ?? []
    })
    const upgraded: FactIndexPendingEntry[] = []
    for (const e of fromSet) {
      const leg = upgradeLegacyIsoToken(db, e.factId, e.kind, '')
      if (leg) upgraded.push(leg)
      else upgraded.push({ ...e, revision: 1 })
    }
    return dedupeEntries(upgraded)
  } catch {
    return []
  }
}

function loadPendingFromDb(db: Database.Database): FactIndexPendingEntry[] {
  const row = db
    .prepare(`SELECT value FROM kv_store WHERE namespace = ? AND key = ?`)
    .get(NAMESPACE, KEY) as { value: string } | undefined
  const entries = parseStored(db, row?.value)
  const payload: StoredPendingV3 = { version: 3, entries }
  if (row?.value && !row.value.includes('"version":3')) {
    writePendingToDb(db, entries)
  }
  return entries
}

function writePendingToDb(db: Database.Database, entries: FactIndexPendingEntry[]): void {
  const deduped = dedupeEntries(entries)
  const now = new Date().toISOString()
  if (deduped.length === 0) {
    db.prepare(`DELETE FROM kv_store WHERE namespace = ? AND key = ?`).run(NAMESPACE, KEY)
    return
  }
  const payload: StoredPendingV3 = { version: 3, entries: deduped }
  db.prepare(
    `INSERT INTO kv_store(namespace, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(NAMESPACE, KEY, JSON.stringify(payload), now)
}

export function mergePendingEntries(
  a: FactIndexPendingEntry[],
  b: FactIndexPendingEntry[]
): FactIndexPendingEntry[] {
  return dedupeEntries([...a, ...b])
}

export function loadPendingFactIndexEntries(dataRoot: string): FactIndexPendingEntry[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  return loadPendingFromDb(db)
}

export function loadPendingFactIndexChanges(dataRoot: string): FactChangeSet {
  return entriesToChangeSet(loadPendingFactIndexEntries(dataRoot))
}

export function appendPendingFactIndexEntryInTx(db: Database.Database, entry: FactIndexPendingEntry): void {
  const merged = mergePendingEntries(loadPendingFromDb(db), [entry])
  writePendingToDb(db, merged)
}

export function appendPendingFactIndexEntriesInTx(
  db: Database.Database,
  entries: FactIndexPendingEntry[]
): void {
  if (entries.length === 0) return
  writePendingToDb(db, mergePendingEntries(loadPendingFromDb(db), entries))
}

/** Legacy change-set append (revision 0 → upgraded on next load). */
export function appendPendingFactIndexChangesInTx(db: Database.Database, changeSet: FactChangeSet): void {
  const merged = mergePendingEntries(loadPendingFromDb(db), changeSetToEntries(changeSet, 0))
  writePendingToDb(db, merged)
}

export function appendPendingFactIndexChanges(dataRoot: string, changeSet: FactChangeSet): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const merged = mergePendingEntries(loadPendingFromDb(db), changeSetToEntries(changeSet, 0))
  writePendingToDb(db, merged)
}

export function appendPendingFactIndexEntries(dataRoot: string, entries: FactIndexPendingEntry[]): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const merged = mergePendingEntries(loadPendingFromDb(db), entries)
  writePendingToDb(db, merged)
}

export function removeAppliedPendingEntries(
  dataRoot: string,
  applied: AppliedFactIndexPendingEntry[]
): void {
  const db = getDatabase(dataRoot)
  if (!db || applied.length === 0) return
  const removeKeys = new Set(applied.map(entryKey))
  const current = loadPendingFromDb(db)
  const remaining = current.filter((e) => !removeKeys.has(entryKey(e)))
  writePendingToDb(db, remaining)
}

export function removeAppliedFromPendingFactIndexChanges(
  dataRoot: string,
  applied: FactChangeSet
): void {
  removeAppliedPendingEntries(dataRoot, changeSetToEntries(applied, 0))
}

export function clearPendingFactIndexChanges(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM kv_store WHERE namespace = ? AND key = ?`).run(NAMESPACE, KEY)
}

export function pendingFactIndexIsEmpty(changeSet: FactChangeSet): boolean {
  return (
    changeSet.inserted.length +
      changeSet.updated.length +
      changeSet.retired.length +
      changeSet.superseded.length ===
    0
  )
}

export function pendingEntriesIsEmpty(entries: FactIndexPendingEntry[]): boolean {
  return entries.length === 0
}

export function findPendingEntry(
  entries: FactIndexPendingEntry[],
  factId: string,
  revision: number
): FactIndexPendingEntry | undefined {
  return entries.find((e) => e.factId === factId && e.revision === revision)
}

export function entriesForFact(entries: FactIndexPendingEntry[], factId: string): FactIndexPendingEntry[] {
  return entries.filter((e) => e.factId === factId)
}

export function changeSetFromEntries(entries: FactIndexPendingEntry[]): FactChangeSet {
  return entriesToChangeSet(entries)
}

export function makePendingEntry(
  factId: string,
  kind: FactChangeKind,
  revision: number
): FactIndexPendingEntry {
  return { factId, kind, revision }
}

export function pruneStalePendingEntries(
  dataRoot: string,
  isCurrentRevision: (factId: string, revision: number) => boolean
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const current = loadPendingFromDb(db)
  const pruned = current.filter((e) => {
    if (e.kind === 'retired' || e.kind === 'superseded') return true
    return isCurrentRevision(e.factId, e.revision)
  })
  writePendingToDb(db, pruned)
}
