import { broadcastToRenderers } from '../rendererBroadcast'
import { invalidateEngineCache } from '../engineCache'
import { createLogger } from '../logger'
import type { FactChangeSet } from './semantic/types.js'
import { mergeFactChangeSets, noteFactChange, emptyFactChangeSet } from './semantic/changeSet.js'
import {
  appendPendingFactIndexEntries,
  changeSetFromEntries,
  changeSetToEntries,
  removeAppliedPendingEntries
} from '../db/repos/factIndexPendingRepo.js'
import type { FactIndexPendingEntry } from './semantic/types.js'
import {
  applyFactIndexProjections,
  retryPendingFactIndexProjections
} from './semantic/semanticMemory.js'
import type { FactStore } from './factStore.js'

const log = createLogger('finalizeNewFacts')

const lastWriteBySession = new Map<
  string,
  { turnIndex: number; structuredCount: number; noteCount: number; at: number }
>()

export function recordMemoryWriteResult(args: {
  sessionId: string
  turnIndex: number
  newFactIds: string[]
  facts: Array<{ id: string; subcategory: string }>
}): void {
  const structuredCount = args.facts.filter((f) => f.subcategory !== 'NOTE').length
  const noteCount = args.facts.filter((f) => f.subcategory === 'NOTE').length
  lastWriteBySession.set(args.sessionId, {
    turnIndex: args.turnIndex,
    structuredCount,
    noteCount,
    at: Date.now(),
  })
}

export function peekLastMemoryWrite(sessionId: string): {
  turnIndex: number
  structuredCount: number
  noteCount: number
} | null {
  return lastWriteBySession.get(sessionId) ?? null
}

/** 记忆写入后统一收尾：刷新缓存、通知渲染进程 */
export async function finalizeNewFacts(args: {
  dataRoot: string
  sessionId: string
  turnIndex: number
  newFactIds: string[]
  facts?: Array<{ id: string; subcategory: string }>
  changeSet?: FactChangeSet
  pendingEntries?: FactIndexPendingEntry[]
  store?: FactStore
}): Promise<void> {
  const { dataRoot, newFactIds, facts = [] } = args

  if (facts.length > 0) {
    recordMemoryWriteResult({
      sessionId: args.sessionId,
      turnIndex: args.turnIndex,
      newFactIds,
      facts,
    })
  }

  let changeSet = args.changeSet ?? emptyFactChangeSet()
  const pendingEntries: FactIndexPendingEntry[] = [...(args.pendingEntries ?? [])]
  for (const id of newFactIds) {
    noteFactChange(changeSet, 'inserted', id)
    const f = args.store?.getById(id)
    pendingEntries.push({
      factId: id,
      kind: 'inserted',
      revision: f?.indexRevision ?? 1
    })
  }
  if (args.store && !args.pendingEntries && !args.changeSet) {
    const storeEntries = args.store.takePendingIndexEntries()
    pendingEntries.push(...storeEntries)
    changeSet = mergeFactChangeSets(changeSet, changeSetFromEntries(storeEntries))
  } else if (args.store && !args.pendingEntries && args.changeSet) {
    changeSet = mergeFactChangeSets(changeSet, args.store.takePendingIndexChanges())
  } else if (pendingEntries.length > 0) {
    changeSet = mergeFactChangeSets(changeSet, changeSetFromEntries(pendingEntries))
  }

  const touched =
    changeSet.inserted.length +
    changeSet.updated.length +
    changeSet.retired.length +
    changeSet.superseded.length

  if (args.store) {
    try {
      await retryPendingFactIndexProjections(dataRoot, args.store)
    } catch (e) {
      log.warn('pending fact index retry failed', { error: String(e) })
    }
  }

  if (touched > 0 && args.store) {
    try {
      const confirmed = await applyFactIndexProjections(
        changeSet,
        { dataRoot, store: args.store },
        pendingEntries
      )
      if (confirmed.length > 0) removeAppliedPendingEntries(dataRoot, confirmed)
      invalidateEngineCache(dataRoot)
    } catch (e) {
      appendPendingFactIndexEntries(
        dataRoot,
        pendingEntries.length > 0 ? pendingEntries : changeSetToEntries(changeSet, 0)
      )
      log.warn('fact index projection failed; queued for retry', { error: String(e) })
      throw e
    }
  }

  broadcastToRenderers('memory:updated', {
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    newFactCount: newFactIds.length,
  })
}

export function notifyMemoryUpdated(args: {
  sessionId: string
  turnIndex: number
  newFactCount?: number
}): void {
  broadcastToRenderers('memory:updated', {
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    newFactCount: args.newFactCount ?? 0,
  })
}
