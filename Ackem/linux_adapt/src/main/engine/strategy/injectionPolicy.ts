// [strategy/injectionPolicy] — 主动 vs 响应式注入策略（纯函数，无业务字符串表）

import { isEmotionalContinuationEvent } from '../emotionalEmergence'
import type { TemporalSemanticSignal } from '../../memory/temporalSignalExtractor'

export type InjectionSlot = 'proactive' | 'responsive' | 'none'

export type TemporalHintRef = {
  dateLabel: string
  narrative: string
  priority: string
} | null

export type InjectionPolicyContext = {
  proactiveLevel: string
  silent: boolean
  eventType?: string
  msgTemporalSignal?: TemporalSemanticSignal | null
  specialDateHit?: TemporalHintRef
  consecutiveMeaningfulTurns?: number
  consecutiveVulnerableTurns?: number
  recentEventTypes?: string[]
}

function responsiveEmergenceSlot(ctx: InjectionPolicyContext): InjectionSlot {
  if (!ctx.eventType) return 'none'
  return isEmotionalContinuationEvent(ctx.eventType, {
    consecutiveMeaningfulTurns: ctx.consecutiveMeaningfulTurns ?? 0,
    consecutiveVulnerableTurns: ctx.consecutiveVulnerableTurns ?? 0,
    recentEventTypes: ctx.recentEventTypes ?? [],
  })
    ? 'responsive'
    : 'none'
}

const USER_INITIATED_EVENT_TYPES = new Set([
  'question',
  'recall',
  'vulnerable',
  'apology',
  'praise',
])

export function isUserInitiatedTemporalInterest(ctx: InjectionPolicyContext): boolean {
  if (ctx.msgTemporalSignal?.label) return true
  if (ctx.specialDateHit && ctx.eventType && USER_INITIATED_EVENT_TYPES.has(ctx.eventType)) {
    return true
  }
  if (ctx.eventType === 'vulnerable' && ctx.specialDateHit) return true
  return false
}

export function canProactiveArbitrate(ctx: InjectionPolicyContext): boolean {
  if (ctx.silent) return false
  if (ctx.proactiveLevel === 'silent' || ctx.proactiveLevel === 'whisper') return false
  return true
}

export function resolveInjectionSlots(ctx: InjectionPolicyContext): {
  temporal: InjectionSlot
  emergence: InjectionSlot
  reason: string
} {
  if (canProactiveArbitrate(ctx)) {
    return { temporal: 'proactive', emergence: 'proactive', reason: 'proactive_arbitrate' }
  }

  const userInitiated = isUserInitiatedTemporalInterest(ctx)

  if (userInitiated && ctx.specialDateHit && ctx.specialDateHit.priority !== 'low') {
    return {
      temporal: 'responsive',
      emergence: responsiveEmergenceSlot(ctx),
      reason: 'responsive_special_date',
    }
  }

  if (userInitiated && ctx.msgTemporalSignal) {
    return {
      temporal: 'responsive',
      emergence: responsiveEmergenceSlot(ctx),
      reason: 'responsive_temporal_signal',
    }
  }

  if (
    !ctx.silent &&
    ctx.proactiveLevel === 'whisper' &&
    ctx.specialDateHit?.priority === 'high'
  ) {
    return { temporal: 'proactive', emergence: 'none', reason: 'whisper_high_priority_date' }
  }

  const responsiveEmergence = responsiveEmergenceSlot(ctx)
  if (ctx.silent && responsiveEmergence === 'responsive') {
    return { temporal: 'none', emergence: 'responsive', reason: 'responsive_emotional_arc' }
  }

  return { temporal: 'none', emergence: 'none', reason: 'blocked' }
}

export function shouldApplyTemporalInjection(
  slot: InjectionSlot,
  temporalHint: TemporalHintRef
): boolean {
  if (!temporalHint || temporalHint.priority === 'low') return false
  return slot !== 'none'
}

export function shouldApplyResponsiveTemporalInjection(slot: InjectionSlot): boolean {
  return slot === 'responsive'
}

/** psyche 注入协议 marker（非业务硬编码） */
export const TEMPORAL_HINT_MARKER = '【今日特别'
export const EMERGENCE_HINT_MARKER = '【心里的感觉'
