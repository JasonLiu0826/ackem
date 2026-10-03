import type { ChannelPlan, IntentKind, PendingConfirm } from '../../shared/channelPlan'
import { writeGrounding } from './grounding'

export function chatPlan(
  intent: IntentKind = 'chat',
  extra: Partial<ChannelPlan> = {}
): ChannelPlan {
  const plan: ChannelPlan = {
    channel: 'chat',
    intent,
    tag: extra.tag ?? null,
    params: extra.params ?? {},
    grounding: '',
    ...extra
  }
  plan.grounding = extra.grounding ?? writeGrounding(plan)
  return plan
}

export function paperCardPlan(params: Record<string, unknown> = {}): ChannelPlan {
  return chatPlan('chat', { chatDelivery: 'paper_card', params })
}

export function pluginPlan(extensionId: string, tag: string | null = null): ChannelPlan {
  return {
    channel: 'plugin',
    intent: 'use',
    tag,
    extensionId,
    params: {},
    grounding: writeGrounding({
      channel: 'plugin',
      intent: 'use',
      tag,
      extensionId,
      params: {}
    })
  }
}

export function pendingPlan(
  pending: PendingConfirm,
  patch: Partial<ChannelPlan>
): ChannelPlan {
  const plan: ChannelPlan = {
    channel:
      pending === 'plugin_ask' || pending === 'use_missing' || pending === 'plugin_use' ? 'chat' : 'work',
    intent: patch.intent ?? (pending === 'work_job' ? 'work' : pending === 'update' ? 'update' : 'create'),
    tag: patch.tag ?? null,
    pendingConfirm: pending,
    params: patch.params ?? {},
    grounding: '',
    ...patch
  }
  plan.grounding = writeGrounding(plan)
  return plan
}
