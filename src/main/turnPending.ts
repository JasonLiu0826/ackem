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
  /** 本轮检索激活的关联 ID 快照（随 turn 固化，防止并发轮次互相污染） */
  activatedAssociationIds?: string[]
}

const pendingByTurnId = new Map<string, PendingChatTurn>()
/** TTL：轮次 15 分钟未 finalize 视为中断（流卡死/进程无响应），自动清理防泄漏与脏状态 */
const PENDING_TTL_MS = 15 * 60 * 1000
const ttlTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function setPendingTurn(turnId: string, p: PendingChatTurn): void {
  pendingByTurnId.set(turnId, p)
  const prev = ttlTimers.get(turnId)
  if (prev) clearTimeout(prev)
  ttlTimers.set(
    turnId,
    setTimeout(() => {
      if (pendingByTurnId.has(turnId)) {
        pendingByTurnId.delete(turnId)
        console.warn(`[turnPending] turn ${turnId} exceeded TTL, dropped (memory ingest skipped)`)
      }
      ttlTimers.delete(turnId)
    }, PENDING_TTL_MS)
  )
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
  const timer = ttlTimers.get(turnId)
  if (timer) clearTimeout(timer)
  ttlTimers.delete(turnId)
  return p
}

export function clearPendingTurn(turnId: string): void {
  pendingByTurnId.delete(turnId)
  const timer = ttlTimers.get(turnId)
  if (timer) clearTimeout(timer)
  ttlTimers.delete(turnId)
}

/** Prefer `surface`. Read legacy `channel` once so old pending objects still finalize. */
export function readPendingSurface(p: PendingChatTurn): 'desktop' | 'weixin' {
  if (p.surface === 'weixin' || p.surface === 'desktop') return p.surface
  const legacy = (p as PendingChatTurn & { channel?: string }).channel
  if (legacy === 'weixin' || legacy === 'desktop') return legacy
  return 'desktop'
}
