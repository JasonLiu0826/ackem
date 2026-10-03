import type { MemoryEvent } from '../contracts.js'

import type { DerivedFactCandidate } from '../semantic/types.js'



const NON_COMPLETION_WORK_TYPES = new Set([

  'work.accepted',

  'work.queued',

  'work.running',

  'work.waiting_permission',

  'work.resumed',

  'work.progressed',

  'work.failed',

  'work.aborted',

  'work.unknown'

])



function trustedWorkSuccess(events: MemoryEvent[]): MemoryEvent | undefined {

  return events.find(

    (e) =>

      e.meta.nature === 'work' &&

      e.meta.eventType === 'work.succeeded' &&

      e.meta.evidenceKind === 'runtime_receipt' &&

      e.meta.status === 'succeeded'

  )

}



/** Work completion facts only from trusted succeeded runtime receipt — never from assistant prose. */

export function deriveWorkFacts(events: MemoryEvent[]): DerivedFactCandidate[] {

  const success = trustedWorkSuccess(events)

  if (!success) return []



  const summary =

    typeof success.payload.content.resultSummary === 'string'

      ? success.payload.content.resultSummary

      : typeof success.payload.content.safeSummary === 'string'

        ? success.payload.content.safeSummary

        : success.payload.summary



  const fetchedAt =

    typeof success.payload.content.fetchedAt === 'string' ? success.payload.content.fetchedAt : success.meta.observedAt

  const source =

    typeof success.payload.content.source === 'string' ? success.payload.content.source : 'ackemcode_runtime'



  return [

    {

      subject: '工作任务',

      summary: `[工作完成] ${summary} (source=${source}; fetchedAt=${fetchedAt})`,

      domain: 'DAILY_LIFE',

      subcategory: 'PLANS',

      confidence: 0.9,

      evidenceEventIds: [success.meta.eventId],

      occurredAt: success.meta.completedAt ?? success.meta.observedAt,

      scheduledFor: null,

      timezone: success.meta.timezone

    }

  ]

}



export function workReceiptStatesPresent(events: MemoryEvent[]): string[] {

  return events

    .filter((e) => e.meta.nature === 'work' && NON_COMPLETION_WORK_TYPES.has(e.meta.eventType))

    .map((e) => e.meta.eventType)

}


