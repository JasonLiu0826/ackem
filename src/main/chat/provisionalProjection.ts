/**
 * Route v2 §17.4 (Codex D2) — provisional reply projection, contract freeze
 * (阶段 0). The companion stream is NOT built here; this module only fixes
 * the shape of the cut-reply store and the cut signal.
 *
 * Isolation contract (must hold for any future implementation):
 * 1. Cut replies live ONLY in this UI-only projection. Normal chat_history
 *    and legacy JSON receive adopted replies only.
 * 2. Cut text MUST NEVER be passed as assistantText into
 *    finalizeTurnAfterStream / postChatTurn (legacy ingest gate).
 * 3. Readers that must NEVER see this store: memory derivation / recall,
 *    companion/proactiveCompose, channels/weixin bridge, diary auto excerpt,
 *    KPI scoring. UI rendering (with the 【先行回应】badge) is the only reader.
 * 4. Acceptance = J21-J25 (route design §13): verified per real reader.
 *
 * Persistence for restart-visible badges lands with the companion stream
 * implementation; this in-memory store fixes the API shape only.
 */

export const CHAT_PROVISIONAL_CUT_CHANNEL = 'chat:provisional-cut'

export type ProvisionalCutReason = 'confirm_card' | 'clarify' | 'error'

export type ProvisionalReply = {
  turnId: string
  sessionId: string
  text: string
  createdAt: string
  supersededBy: ProvisionalCutReason
  planId?: string
}

export interface ProvisionalProjectionStore {
  append(reply: ProvisionalReply): void
  listBySession(sessionId: string): ProvisionalReply[]
  clearSession(sessionId: string): void
}

export function createInMemoryProvisionalProjection(): ProvisionalProjectionStore {
  const bySession = new Map<string, ProvisionalReply[]>()
  return {
    append(reply) {
      const list = bySession.get(reply.sessionId) ?? []
      if (list.some((r) => r.turnId === reply.turnId)) return
      list.push({ ...reply })
      bySession.set(reply.sessionId, list)
    },
    listBySession(sessionId) {
      return (bySession.get(sessionId) ?? []).map((r) => ({ ...r }))
    },
    clearSession(sessionId) {
      bySession.delete(sessionId)
    }
  }
}
