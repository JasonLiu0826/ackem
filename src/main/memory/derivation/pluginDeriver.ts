import type { MemoryEvent } from '../contracts.js'

import type { DerivedFactCandidate } from '../semantic/types.js'

import { buildRunTargetIndex, targetIdFromPluginSuccess } from './pluginHistory.js'

import { canPromotePluginHabit } from './promotionPolicy.js'



export type PluginDeriverOpts = {

  /** Prior stable successes for targetId (outside current batch). */

  priorSuccessCountByTarget?: Map<string, number>

}



function pluginOutcomeSummary(ev: MemoryEvent): string {

  const fromPayload =

    typeof ev.payload.content.summary === 'string'

      ? ev.payload.content.summary

      : typeof ev.payload.content.resultSummary === 'string'

        ? ev.payload.content.resultSummary

        : ev.payload.summary

  return fromPayload.trim()

}



/** Plugin: single call → event-level outcome only; habit candidate needs stable repetition. */

export function derivePluginFacts(events: MemoryEvent[], opts: PluginDeriverOpts = {}): DerivedFactCandidate[] {

  const out: DerivedFactCandidate[] = []

  const successes = events.filter(

    (e) => e.meta.nature === 'plugin' && e.meta.eventType === 'plugin.succeeded'

  )

  const runTargetIndex = buildRunTargetIndex(events)

  const successCountInBatch = new Map<string, number>()

  for (const ev of successes) {

    const targetId = targetIdFromPluginSuccess(ev, runTargetIndex)

    if (!targetId) continue

    successCountInBatch.set(targetId, (successCountInBatch.get(targetId) ?? 0) + 1)

  }



  const habitPromoted = new Set<string>()

  for (const ev of successes) {

    const targetId = targetIdFromPluginSuccess(ev, runTargetIndex)

    const summary = pluginOutcomeSummary(ev)

    if (!summary) continue

    if (!targetId) continue

    out.push({

      subject: '插件',

      summary: `[插件结果] ${summary}`,

      domain: 'DAILY_LIFE',

      subcategory: 'NOW',

      confidence: 0.6,

      evidenceEventIds: [ev.meta.eventId],

      occurredAt: ev.meta.completedAt ?? ev.meta.observedAt,

      scheduledFor: null,

      timezone: ev.meta.timezone

    })



    const total =

      (opts.priorSuccessCountByTarget?.get(targetId) ?? 0) + (successCountInBatch.get(targetId) ?? 0)

    if (!habitPromoted.has(targetId) && canPromotePluginHabit(total, 0.8)) {

      habitPromoted.add(targetId)

      out.push({

        subject: '插件习惯',

        summary: `[习惯候选] 常使用插件 ${targetId}`,

        domain: 'DAILY_LIFE',

        subcategory: 'PLANS',

        confidence: 0.76,

        evidenceEventIds: successes

          .filter((s) => targetIdFromPluginSuccess(s, runTargetIndex) === targetId)

          .map((s) => s.meta.eventId),

        occurredAt: ev.meta.completedAt ?? ev.meta.observedAt,

        scheduledFor: null,

        timezone: ev.meta.timezone

      })

    }

  }



  return out

}



/** Non-terminal plugin states must not produce completion-style facts. */

export function pluginEventsBlockCompletionFacts(events: MemoryEvent[]): boolean {

  return events.some(

    (e) =>

      e.meta.nature === 'plugin' &&

      ['plugin.accepted', 'plugin.queued', 'plugin.running', 'plugin.waiting_permission', 'plugin.failed', 'plugin.aborted'].includes(

        e.meta.eventType

      )

  )

}


