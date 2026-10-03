import type { Event, FullState, TurnTrace } from './engine/types'
import type { PrefetchedFact } from './memory/ingest'
import type { InteractionSurface } from './memory/provenance'

export type PendingChatTurn = {
  dataRoot: string
  sessionId: string
  /** Ledger turn id (memory_events.turn_id); required for episode evidence wiring. */
  turnId?: string
  turnIndex: number
  userMsg: string
  newState: FullState
  /** v1.1.0 本轮前状态，用于 stateDelta */
  prevState?: FullState
  skipIngest: boolean
  trace: TurnTrace
  event: Event
  /** Ledger/UI surface. Legacy in-memory objects may still carry `channel`. */
  surface?: 'desktop' | 'weixin'
  /** 记忆场景面（主聊 / 微信 / …） */
  interactionSurface?: InteractionSurface
  /** 本轮记忆归属 Agent；缺省由 sessionId 推导 */
  ownerAgentId?: string
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

/** Prefer `surface`. Read legacy `channel` once so old pending objects still finalize. */
export function readPendingSurface(p: PendingChatTurn): 'desktop' | 'weixin' {
  if (p.surface === 'weixin' || p.surface === 'desktop') return p.surface
  const legacy = (p as PendingChatTurn & { channel?: string }).channel
  if (legacy === 'weixin' || legacy === 'desktop') return legacy
  return 'desktop'
}
