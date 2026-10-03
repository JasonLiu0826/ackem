import type { MemoryEvent } from '../contracts.js'

import type { PrefetchedFact } from '../ingest.js'

import { validateLlmFactDrafts } from './candidateValidator.js'

import {

  assertDraftsGroundedInUserEvidence,

  isSummaryFullyGroundedInUserText,

  userTextFromChatEvent

} from './userFactGrounding.js'



export function prefetchedFactsToLlmDrafts(

  facts: PrefetchedFact[],

  userEvidenceEventId: string,

  contextEvents: MemoryEvent[]

): Array<{

  subject: string

  summary: string

  domain: string

  subcategory: string

  confidence: number

  evidenceEventIds: string[]

}> {

  const userEv = contextEvents.find((e) => e.meta.eventId === userEvidenceEventId)

  const userText = userEv ? userTextFromChatEvent(userEv) : ''

  return facts.map((f) => {

    const explicit = Array.isArray((f as { evidenceEventIds?: unknown }).evidenceEventIds)

      ? ((f as unknown as { evidenceEventIds: string[] }).evidenceEventIds.filter(

          (x): x is string => typeof x === 'string'

        ))

      : []

    let evidenceEventIds = explicit

    if (evidenceEventIds.length === 0) {

      if (userEv && isSummaryFullyGroundedInUserText(f.summary, userText)) {

        evidenceEventIds = [userEvidenceEventId]

      }

    }

    return {

      subject: f.subject,

      summary: f.summary,

      domain: f.domain,

      subcategory: f.subcategory,

      confidence: typeof f.confidence === 'number' ? f.confidence : 0.7,

      evidenceEventIds

    }

  })

}



/** Reject invalid LLM extraction before checkpoint or fact writes (Task 11). */

export function assertPrefetchedFactsAllowed(

  facts: PrefetchedFact[],

  contextEvents: MemoryEvent[],

  userEvidenceEventId: string

): void {

  const drafts = prefetchedFactsToLlmDrafts(facts, userEvidenceEventId, contextEvents)

  const verdict = validateLlmFactDrafts(drafts, contextEvents)

  if (!verdict.ok) {

    throw new Error(verdict.reason)

  }

  assertDraftsGroundedInUserEvidence(verdict.drafts, contextEvents)

}


