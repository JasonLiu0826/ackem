import type { Event, FullState, TurnTrace } from './engine/types'
import type { PrefetchedFact } from './memory/ingest'

export type PendingChatTurn = {
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  newState: FullState
  skipIngest: boolean
  trace: TurnTrace
  event: Event
  /** FIX-001: facts from extract_facts tool — ingest skips LLM extraction but still writes */
  prefetchedFacts?: PrefetchedFact[]
  skipLlmExtraction?: boolean
}

const pendingByTurnId = new Map<string, PendingChatTurn>()

export function setPendingTurn(turnId: string, p: PendingChatTurn): void {
  pendingByTurnId.set(turnId, p)
}

export function peekPendingTurn(turnId: string): PendingChatTurn | undefined {
  return pendingByTurnId.get(turnId)
}

export function updatePendingTurn(turnId: string, patch: Partial<PendingChatTurn>): void {
  const p = pendingByTurnId.get(turnId)
  if (!p) return
  pendingByTurnId.set(turnId, { ...p, ...patch })
}

export function takePendingTurn(turnId: string): PendingChatTurn | undefined {
  const p = pendingByTurnId.get(turnId)
  pendingByTurnId.delete(turnId)
  return p
}

export function clearPendingTurn(turnId: string): void {
  pendingByTurnId.delete(turnId)
}
