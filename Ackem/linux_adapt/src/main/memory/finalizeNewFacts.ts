import { broadcastToRenderers } from '../rendererBroadcast'
import { invalidateEngineCache } from '../engineCache'
import { createLogger } from '../logger'

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

  if (newFactIds.length > 0) {
    try {
      const { refreshFactEmbeddingsForIds } = await import('../engineCache')
      await refreshFactEmbeddingsForIds(dataRoot, newFactIds)
    } catch (e) {
      log.warn('fact embedding refresh failed', { error: String(e) })
    }
    invalidateEngineCache(dataRoot)
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
