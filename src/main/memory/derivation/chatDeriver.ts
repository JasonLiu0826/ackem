import type { MemoryEvent } from '../contracts.js'

import type { DerivedFactCandidate } from '../semantic/types.js'

import type { LlmFactDraft } from './candidateValidator.js'



function userAssertionEvents(events: MemoryEvent[]): MemoryEvent[] {

  return events.filter(

    (e) =>

      e.meta.nature === 'chat' &&

      e.meta.eventType === 'chat.user_message' &&

      (e.meta.evidenceKind === 'user_assertion' || e.meta.evidenceKind === 'user_correction')

  )

}



/** Chat facts: user assertion/correction only; assistant prose is never primary evidence. */

export function deriveChatFacts(

  events: MemoryEvent[],

  validatedLlmDrafts: LlmFactDraft[] = []

): DerivedFactCandidate[] {

  const out: DerivedFactCandidate[] = []

  const userEvents = userAssertionEvents(events)



  for (const ev of userEvents) {

    const text =

      typeof ev.payload.content.userText === 'string'

        ? ev.payload.content.userText

        : typeof ev.payload.content.text === 'string'

          ? ev.payload.content.text

          : ev.payload.summary

    if (!text.trim()) continue

    // LLM 已就同一用户事件提炼出有效事实时，deterministic 规则只做兜底、不重复派生：
    // 避免同义事实因 subcategory 不同（LLM draft 常为 NOW）无法合并而双写。
    const coveredByLlm = validatedLlmDrafts.some((d) => d.evidenceEventIds.includes(ev.meta.eventId))
    if (coveredByLlm) continue

    out.push({

      subject: '用户',

      summary: text.trim(),

      domain: 'DAILY_LIFE',

      // 明确自我断言（“我喜欢/我住在/我习惯”等）是身份/生活类信息，属跨会话记忆；
      // 但带期限的自述（scheduledFor 非空，如“我喜欢下周去西湖跑步”）是一次性计划/事件，
      // 不是长期偏好——期限过后不得成为跨会话长期 LIFE_STORY，按临时 NOTE 处理。
      // 更正仍是临时 NOTE；助手/寒暄不进入此分支。
      subcategory:
        ev.meta.evidenceKind === 'user_correction' || ev.meta.scheduledFor ? 'NOTE' : 'LIFE_STORY',

      confidence: ev.meta.evidenceKind === 'user_correction' ? 0.95 : 0.85,

      evidenceEventIds: [ev.meta.eventId],

      occurredAt: ev.meta.occurredAt,

      scheduledFor: ev.meta.scheduledFor,

      temporalRange: (() => {
        const range = ev.payload.content.temporalRange
        if (!range || typeof range !== 'object') return undefined
        const value = range as Record<string, unknown>
        return typeof value.fromLocalDate === 'string' && typeof value.toLocalDate === 'string'
          ? { fromLocalDate: value.fromLocalDate, toLocalDate: value.toLocalDate }
          : undefined
      })(),

      timezone: ev.meta.timezone

    })

  }



  for (const draft of validatedLlmDrafts) {

    const linkedUser = draft.evidenceEventIds.some((id) =>

      userEvents.some((e) => e.meta.eventId === id)

    )

    if (!linkedUser) continue

    out.push({

      subject: draft.subject,

      summary: draft.summary,

      domain: draft.domain,

      subcategory: draft.subcategory,

      confidence: draft.confidence,

      evidenceEventIds: draft.evidenceEventIds,

      occurredAt: null,

      scheduledFor: null,

      timezone: userEvents[0]?.meta.timezone ?? 'UTC'

    })

  }



  return out

}


