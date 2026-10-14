import type { ChannelPlan } from '../../shared/channelPlan'
import type { ExecuteResult } from './executeChannel'
import type { ResponsePolicy } from '../../shared/response'

type Snapshot = { plan: ChannelPlan; executed: boolean; policy: ResponsePolicy }
const store = new Map<string, Snapshot>()
const turns = new Map<string, Snapshot>()
export function rememberChannelPlan(sessionId: string, plan: ChannelPlan, executed: boolean, turnId?: string, execution?: Pick<ExecuteResult, 'status' | 'receipt' | 'runId'>): void {
  // A legacy boolean never proves completion. Only an explicit execution outcome can.
  const policy: ResponsePolicy = { origin: plan.pendingConfirm ? 'clarify' : plan.channel === 'chat' ? 'answer' : 'action_ack', style: 'assistant', plan,
    status: execution?.status ?? (executed ? 'running' : 'not_executed'), receipt: execution?.receipt, runId: execution?.runId }
  const snapshot = { plan: structuredClone(plan), executed, policy }
  store.set(sessionId, snapshot)
  if (turnId) { turns.set(`${sessionId}:${turnId}`, snapshot); if (turns.size > 2000) turns.delete(turns.keys().next().value!) }
}
export function peekChannelPlan(sessionId: string, turnId?: string): Snapshot | undefined {
  return turnId ? turns.get(`${sessionId}:${turnId}`) : store.get(sessionId)
}
export function resetLastPlans(): void { store.clear(); turns.clear() }
