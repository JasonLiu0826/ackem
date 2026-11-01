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
