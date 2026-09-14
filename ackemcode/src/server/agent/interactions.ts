import type { AskUserAnswerPayload, PlanDecisionPayload } from '../../shared/types.js'

export type AskUserQuestion = {
  question: string
  header?: string
  options: Array<{ label: string; description?: string; preview?: string }>
  multiSelect?: boolean
}

/** @deprecated prefer AskUserAnswerPayload */
export type AskUserAnswer = AskUserAnswerPayload

/** @deprecated prefer PlanDecisionPayload.decision */
export type PlanApprovalDecision = 'approve' | 'reject'

export type { AskUserAnswerPayload, PlanDecisionPayload }

/**
 * Blocks the agent loop until the UI answers ask_user / plan_approval.
 * Mirrors Claude Code AskUserQuestion / ExitPlanMode approval UX.
 */
export class InteractionBroker {
  private waiters = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()

  wait<T>(requestId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this.waiters.set(requestId, {
        resolve: (v) => resolve(v as T),
        reject
      })
    })
  }

  resolve(requestId: string, value: unknown): boolean {
    const w = this.waiters.get(requestId)
    if (!w) return false
    this.waiters.delete(requestId)
    w.resolve(value)
    return true
  }

  pendingCount(): number {
    return this.waiters.size
  }

  cancelAll(reason = 'cancelled'): number {
    const n = this.waiters.size
    for (const [id, w] of this.waiters) {
      w.reject(new Error(reason))
      this.waiters.delete(id)
    }
    return n
  }
}
