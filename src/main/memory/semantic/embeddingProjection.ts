import { getDatabase } from '../../db/database.js'
import { getCachedEmbeddingProvider } from '../../engineCache.js'
import {
  computeCorpusHash,
  deleteFactEmbeddingsAllModels,
  deleteFactEmbeddingsByIds,
  setStoredCorpusHash
} from '../../db/repos/factEmbeddingsRepo.js'
import type { FactStore } from '../factStore.js'
import type { AppliedFactIndexPendingEntry, FactChangeSet, FactIndexPendingEntry } from './types.js'
import { pendingEntryMatchesFact } from './factGeneration.js'
import { awaitProjectionGateIfArmed } from './projectionGate.js'

export type EmbeddingProjectionDeps = {
  dataRoot: string
  store: FactStore
}

export type EmbeddingProjectionResult = {
  /** Generations that received a fresh embedding write. */
  confirmed: AppliedFactIndexPendingEntry[]
  /** Generations still waiting on provider / embed failure. */
  unconfirmed: FactIndexPendingEntry[]
}

function resolveModelSignature(dataRoot: string): string | null {
  const provider = getCachedEmbeddingProvider(dataRoot)
  if (!provider?.ready()) return null
  return provider.name()
}

function pendingForFact(entries: FactIndexPendingEntry[], factId: string): FactIndexPendingEntry[] {
  return entries.filter((e) => e.factId === factId)
}

/** Refresh vectors for inserts/updates; drop retired/superseded and stale update rows. */
export async function applyEmbeddingProjection(
  changeSet: FactChangeSet,
  deps: EmbeddingProjectionDeps,
  pendingEntries: FactIndexPendingEntry[] = []
): Promise<EmbeddingProjectionResult> {
  await awaitProjectionGateIfArmed()

  const readyEntries = pendingEntries.filter((e) =>
    pendingEntryMatchesFact(e, deps.store.getById(e.factId))
  )
  const readyIds = new Set(readyEntries.map((e) => e.factId))
  const refreshIds = [...new Set([...changeSet.inserted, ...changeSet.updated].filter((id) => readyIds.has(id)))]
  const dropIds = [
    ...new Set([...changeSet.retired, ...changeSet.superseded, ...changeSet.updated].filter((id) => readyIds.has(id)))
  ]

  const db = getDatabase(deps.dataRoot)
  const modelSig = resolveModelSignature(deps.dataRoot)
  const confirmed: AppliedFactIndexPendingEntry[] = []
  const unconfirmed: FactIndexPendingEntry[] = []

  if (db && dropIds.length > 0) {
    if (modelSig) {
      deleteFactEmbeddingsByIds(db, modelSig, dropIds)
    } else {
      deleteFactEmbeddingsAllModels(db, dropIds)
    }
    for (const id of dropIds) {
      deps.store._embeddingCache?.delete(id)
    }
    for (const id of dropIds) {
      for (const e of pendingForFact(pendingEntries, id)) {
        if (e.kind === 'retired' || e.kind === 'superseded') {
          confirmed.push(e)
        }
      }
    }
  }

  if (refreshIds.length === 0) {
    if (db && modelSig) {
      setStoredCorpusHash(db, modelSig, computeCorpusHash(deps.store.listActive()))
    }
    return { confirmed, unconfirmed }
  }

  if (!modelSig) {
    for (const id of refreshIds) {
      for (const e of pendingForFact(pendingEntries, id)) {
        if (e.kind === 'inserted' || e.kind === 'updated') unconfirmed.push(e)
      }
    }
    return { confirmed, unconfirmed }
  }

  const { refreshFactEmbeddingsForIds } = await import('../../engineCache.js')
  await refreshFactEmbeddingsForIds(deps.dataRoot, refreshIds)

  for (const id of refreshIds) {
    const fact = deps.store.getById(id)
    if (!fact || fact.status !== 'active') continue
    for (const e of pendingForFact(pendingEntries, id)) {
      if (e.kind !== 'inserted' && e.kind !== 'updated') continue
      if (pendingEntryMatchesFact(e, fact)) confirmed.push(e)
      else unconfirmed.push(e)
    }
  }

  return { confirmed, unconfirmed }
}
