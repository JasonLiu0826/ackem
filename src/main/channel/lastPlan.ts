import type { ChannelPlan } from '../../shared/channelPlan'

const store = new Map<string, { plan: ChannelPlan; executed: boolean }>()

export function rememberChannelPlan(
  sessionId: string,
  plan: ChannelPlan,
  executed: boolean
): void {
  store.set(sessionId, { plan, executed })
}

export function peekChannelPlan(
  sessionId: string
): { plan: ChannelPlan; executed: boolean } | undefined {
  return store.get(sessionId)
}

export function resetLastPlans(): void {
  store.clear()
}
