// [strategy/topicSelector] — 话题选择器
// 职责：从多个信号源加权选出最合适的话题，供策略层消费
// 纯数学加权，零 I/O，<1ms
// 设计文档：docs/strategy/策略层详细设计_v2_更像人_6_11.md

import {
  renderLightSuffix,
  renderTimeReflectionHint,
} from '../emotionalEmergence'
import type { EmergenceState } from '../types'
import type { SpecialDate } from '../temporalAwareness/specialDateDetector'
import {
  resolveInjectionSlots,
} from './injectionPolicy'

export type TopicCandidate = {
  source: 'emergence' | 'special_date' | 'memory_echo' | 'desire' | 'habit' | 'casual'
  topic: string
  weight: number
  factId?: string
}

export interface TopicContext {
  emergenceFlavor?: string
  specialDates?: SpecialDate[]
  timeOfDay?: string
  eventType?: string
  recentlyRecalledIds?: Set<string>
}

export function selectTopic(
  candidates: TopicCandidate[],
  ctx: TopicContext
): TopicCandidate | null {
  if (candidates.length === 0) return null

  // ═══ 深夜规则：过滤日常琐事 ═══
  if (ctx.timeOfDay === 'late_night' && ctx.eventType === 'vulnerable') {
    candidates = candidates.filter(c =>
      c.source === 'emergence' ||
      c.source === 'special_date' ||
      c.topic.includes('关系') ||
      c.topic.includes('陪伴')
    )
  }

  // ═══ 去重：最近提过的不选 ═══
  if (ctx.recentlyRecalledIds) {
    candidates = candidates.filter(c => !c.factId || !ctx.recentlyRecalledIds!.has(c.factId))
    if (candidates.length === 0) return null
  }

  // ═══ 多信号加权 ═══
  const scored = candidates.map(c => {
    let score = c.weight

    // 涌现匹配：如果候选话题和当前涌现风格一致，大幅加权
    if (ctx.emergenceFlavor && c.source === 'emergence') {
      score *= 1.5
    }

    // 特殊日期匹配：特殊日期的相关话题优先级最高
    if (ctx.specialDates && ctx.specialDates.length > 0 && c.source === 'special_date') {
      score *= 1.3
    }

    return { ...c, weight: score }
  })

  // 排序取最高
  scored.sort((a, b) => b.weight - a.weight)
  return scored[0]
}

export function shouldArbitrateTopic(args: {
  silent: boolean
  proactiveLevel: string
}): boolean {
  if (args.silent) return false
  if (args.proactiveLevel === 'silent' || args.proactiveLevel === 'whisper') return false
  return true
}

/** 高优先级特殊日（周年/生日）：whisper 下仍轻量注入【今日特别】，silent 仍禁止（除非 responsive policy） */
export function shouldInjectHighPrioritySpecialDate(args: {
  silent: boolean
  proactiveLevel: string
  temporalHint?: { priority: string } | null
}): boolean {
  const slots = resolveInjectionSlots({
    proactiveLevel: args.proactiveLevel,
    silent: args.silent,
    specialDateHit: args.temporalHint
      ? { dateLabel: '', narrative: '', priority: args.temporalHint.priority }
      : null,
  })
  return slots.temporal === 'proactive' && slots.reason === 'whisper_high_priority_date'
}

export { TEMPORAL_HINT_MARKER, EMERGENCE_HINT_MARKER } from './injectionPolicy'

export function formatSelectedTopicInjection(
  selected: TopicCandidate,
  opts: {
    temporalHint?: { dateLabel: string; narrative: string } | null
    emergence?: EmergenceState | null
  }
): string {
  switch (selected.source) {
    case 'special_date':
      if (opts.temporalHint) {
        return `\n\n【今日特别 · ${opts.temporalHint.dateLabel}】${opts.temporalHint.narrative} 如果对话氛围合适，可以自然地提起。不要生硬，不要像系统通知。`
      }
      return `\n\n【今日特别】${selected.topic}`
    case 'emergence': {
      if (!opts.emergence || opts.emergence.type !== 'timeReflection') return ''
      const hint = opts.emergence.hasExpressed
        ? renderLightSuffix(opts.emergence)
        : renderTimeReflectionHint(opts.emergence)
      return hint ? `\n\n${hint}` : ''
    }
    case 'desire':
      return `\n\n【想做的事】\n1. ${selected.topic}\n（自然地融入对话，不要逐条念出来）`
    case 'memory_echo':
      return `\n\n【可以自然提起的旧事（不要生硬插入，找到合适的话头再提）】\n${selected.topic}`
    case 'habit':
    case 'casual':
    default:
      return ''
  }
}

export type ResolveTopicInput = {
  temporalHint?: { dateLabel: string; narrative: string; priority: string } | null
  emergence?: EmergenceState | null
  desireHints?: string[]
  recallCandidate?: { prompt: string; factId: string } | null
  ctx: TopicContext
  arbitrate: boolean
}

export function resolveTopicSelection(input: ResolveTopicInput): {
  selected: TopicCandidate | null
  injection: string
} {
  if (!input.arbitrate) {
    return { selected: null, injection: '' }
  }

  const emergenceHintText =
    input.emergence?.type === 'timeReflection'
      ? renderTimeReflectionHint(input.emergence)
      : null

  const candidates = buildTopicCandidates({
    temporalHint: input.temporalHint?.priority !== 'low' ? input.temporalHint : null,
    emergenceHint: emergenceHintText,
    desireHints: input.desireHints,
    activeRecallPrompt: input.recallCandidate?.prompt ?? null,
    activeRecallFactId: input.recallCandidate?.factId,
  })

  const selected = selectTopic(candidates, input.ctx)
  if (!selected || selected.source === 'casual') {
    return { selected, injection: '' }
  }

  return {
    selected,
    injection: formatSelectedTopicInjection(selected, {
      temporalHint: input.temporalHint,
      emergence: input.emergence,
    }),
  }
}

export function buildTopicCandidates(args: {
  temporalHint?: { dateLabel: string; narrative: string; priority: string } | null
  emergenceHint?: string | null
  desireHints?: string[]
  activeRecallPrompt?: string | null
  activeRecallFactId?: string
}): TopicCandidate[] {
  const candidates: TopicCandidate[] = []

  if (args.temporalHint && args.temporalHint.priority !== 'low') {
    candidates.push({
      source: 'special_date',
      topic: args.temporalHint.narrative,
      weight: args.temporalHint.priority === 'high' ? 0.85 : 0.65,
    })
  }

  if (args.emergenceHint) {
    candidates.push({
      source: 'emergence',
      topic: '此刻的感受',
      weight: 0.7,
    })
  }

  if (args.desireHints) {
    for (const hint of args.desireHints.slice(0, 2)) {
      candidates.push({ source: 'desire', topic: hint, weight: 0.5 })
    }
  }

  if (args.activeRecallPrompt) {
    candidates.push({
      source: 'memory_echo',
      topic: args.activeRecallPrompt,
      weight: 0.4,
      factId: args.activeRecallFactId,
    })
  }

  // 兜底闲聊
  candidates.push({ source: 'casual', topic: '自然回应', weight: 0.3 })

  return candidates
}
