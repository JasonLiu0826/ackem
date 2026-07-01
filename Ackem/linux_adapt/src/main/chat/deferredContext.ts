import type { FactStore } from '../memory/factStore'
import type { MemoryRetriever } from '../memory/retriever'
import type { FullState } from '../engine/types'
import { prepareTurnContext } from '../engine/prepareTurnContext'
import { workingMemory } from '../memory/workingMemory'

export type DeferredEnrichArgs = {
  turnId: string
  msg: string
  sessionId: string
  turnIndex: number
  memoryBudgetChars: number
  state: FullState
  factStore: FactStore
  retriever: MemoryRetriever
  dataRoot: string
  adultMode?: boolean
}

type DeferredEntry = {
  promise: Promise<{ tierBBlock: string }>
}

const store = new Map<string, DeferredEntry>()

async function runEnrich(args: DeferredEnrichArgs): Promise<{ tierBBlock: string }> {
  const {
    msg,
    sessionId,
    turnIndex,
    memoryBudgetChars,
    state,
    factStore,
    retriever,
    dataRoot,
    adultMode = false,
  } = args

  const prepared = await prepareTurnContext({
    msg,
    state,
    factStore,
    retriever,
    sessionId,
    turnIndex,
    memoryBudgetChars,
    recentUserMessages: [msg],
    dataRoot,
    adultMode,
  })

  let tierBBlock = prepared.retrieval.tierBBlock
  const wmBlock = workingMemory.buildContextBlock(sessionId)
  if (wmBlock && tierBBlock) {
    tierBBlock = [wmBlock, tierBBlock].join('\n\n')
  } else if (wmBlock) {
    tierBBlock = wmBlock
  }
  if (tierBBlock.length > memoryBudgetChars * 1.5) {
    tierBBlock = tierBBlock.slice(0, Math.floor(memoryBudgetChars * 1.5))
  }
  return { tierBBlock }
}

export function startDeferredEnrich(args: DeferredEnrichArgs): void {
  store.set(args.turnId, { promise: runEnrich(args) })
}

export async function awaitDeferredEnrich(turnId: string): Promise<string> {
  const entry = store.get(turnId)
  if (!entry) return ''
  const { tierBBlock } = await entry.promise
  return tierBBlock
}

export function clearDeferredEnrich(turnId: string): void {
  store.delete(turnId)
}
