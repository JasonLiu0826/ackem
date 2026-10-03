import { rebuildFactsFts } from '../../db/repos/fts.js'
import {
  appendPendingFactIndexChanges,
  appendPendingFactIndexEntries,
  changeSetFromEntries,
  loadPendingFactIndexEntries,
  loadPendingFactIndexChanges,
  pendingEntriesIsEmpty,
  pendingFactIndexIsEmpty,
  pruneStalePendingEntries,
  removeAppliedPendingEntries
} from '../../db/repos/factIndexPendingRepo.js'
import { getOrCreateEngineCache, invalidateEngineCache } from '../../engineCache.js'
import { FactStore, defaultFactsPath } from '../factStore.js'
import { applyAssociationProjection } from './associationProjection.js'
import { applyEmbeddingProjection } from './embeddingProjection.js'
import { emptyFactChangeSet, mergeFactChangeSets } from './changeSet.js'
import type { AppliedFactIndexPendingEntry, FactChangeSet, FactIndexPendingEntry } from './types.js'
import { factIndexRevision } from './factGeneration.js'

const EMPTY_INDEX: import('../../indexer.js').IndexSnapshot = {
  version: 1,
  builtAt: '',
  dataRoot: '',
  chunks: []
}

function ensureEngineCacheForProjection(dataRoot: string, store: FactStore): void {
  const snapshot = { ...EMPTY_INDEX, dataRoot, builtAt: new Date().toISOString() }
  const entry = getOrCreateEngineCache(dataRoot, snapshot)
  if (entry.store !== store) {
    entry.store = store
  }
}

/** Align FTS with committed memory_facts (recovery after crash / legacy post-tx sync). */
export function reconcileFactsFts(dataRoot: string): void {
  rebuildFactsFts(dataRoot)
}

/** Apply incremental index projections for a fact change batch. */
export async function applyFactIndexProjections(
  changeSet: FactChangeSet,
  opts: { dataRoot: string; store: FactStore },
  pendingEntries: FactIndexPendingEntry[] = []
): Promise<AppliedFactIndexPendingEntry[]> {
  if (pendingFactIndexIsEmpty(changeSet)) return []
  ensureEngineCacheForProjection(opts.dataRoot, opts.store)
  const embed = await applyEmbeddingProjection(changeSet, opts, pendingEntries)
  applyAssociationProjection(opts.dataRoot, changeSet)
  return embed.confirmed
}

/** Production entry: flush in-process microtask batch (kv durable rows recovered on restart). */
export async function flushFactStoreIndexProjections(store: FactStore): Promise<void> {
  const dataRoot = store.getDataRoot()
  const localEntries = store.takePendingIndexEntries()
  const changeSet = changeSetFromEntries(localEntries)
  if (pendingFactIndexIsEmpty(changeSet)) return

  try {
    const confirmed = await applyFactIndexProjections(changeSet, { dataRoot, store }, localEntries)
    if (confirmed.length > 0) removeAppliedPendingEntries(dataRoot, confirmed)
    pruneStalePendingEntries(dataRoot, (factId, revision) => factIndexRevision(store.getById(factId)) === revision)
  } catch (e) {
    appendPendingFactIndexEntries(dataRoot, localEntries)
    throw e
  }
}

/** Retry persisted pending index work after failure or restart. */
export async function retryPendingFactIndexProjections(
  dataRoot: string,
  store: FactStore
): Promise<boolean> {
  const pendingEntries = loadPendingFactIndexEntries(dataRoot)
  if (pendingEntriesIsEmpty(pendingEntries)) return false
  const changeSet = changeSetFromEntries(pendingEntries)
  const confirmed = await applyFactIndexProjections(changeSet, { dataRoot, store }, pendingEntries)
  if (confirmed.length > 0) removeAppliedPendingEntries(dataRoot, confirmed)
  pruneStalePendingEntries(dataRoot, (factId, revision) => factIndexRevision(store.getById(factId)) === revision)
  return confirmed.length > 0 || !pendingEntriesIsEmpty(loadPendingFactIndexEntries(dataRoot))
}

/**
 * App startup: reconcile FTS and retry durable KV pending index work (no new fact writes).
 * @returns true when KV had pending index entries before retry; false when nothing was queued.
 */
export async function recoverSemanticFactIndexes(dataRoot: string): Promise<boolean> {
  const store = new FactStore(defaultFactsPath(dataRoot))
  store.preferDbWrites()
  store.load()
  reconcileFactsFts(dataRoot)
  const hadPending = !pendingEntriesIsEmpty(loadPendingFactIndexEntries(dataRoot))
  if (hadPending) {
    await retryPendingFactIndexProjections(dataRoot, store)
    invalidateEngineCache(dataRoot)
  }
  return hadPending
}

/** Rebuild FTS from active facts (admin recovery). */
export function rebuildFactSearchIndex(dataRoot: string): void {
  rebuildFactsFts(dataRoot)
}

export function mergePendingWithLocalChanges(
  dataRoot: string,
  local: FactChangeSet
): FactChangeSet {
  return mergeFactChangeSets(loadPendingFactIndexChanges(dataRoot), local)
}
