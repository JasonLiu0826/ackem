import type { MemoryEvent } from '../contracts.js'

import {

  assertDraftsGroundedInUserEvidence,

  isUserChatEvidenceEvent

} from './userFactGrounding.js'



export type LlmFactDraft = {

  subject: string

  summary: string

  domain: string

  subcategory: string

  confidence: number

  evidenceEventIds: string[]

}



export type ValidateLlmDraftsResult =

  | { ok: true; drafts: LlmFactDraft[] }

  | { ok: false; reason: string }



function isNonEmptyString(v: unknown): v is string {

  return typeof v === 'string' && v.trim().length > 0

}



function hasTrustedWorkSuccess(events: MemoryEvent[]): boolean {

  return events.some(

    (e) =>

      e.meta.nature === 'work' &&

      e.meta.eventType === 'work.succeeded' &&

      e.meta.evidenceKind === 'runtime_receipt'

  )

}



/** Deterministic gate for LLM extraction output (Task 11). Rejects whole batch on structural error. */

export function validateLlmFactDrafts(

  raw: unknown,

  contextEvents: MemoryEvent[]

): ValidateLlmDraftsResult {

  if (!Array.isArray(raw)) {

    return { ok: false, reason: 'llm drafts must be an array' }

  }

  const drafts: LlmFactDraft[] = []

  const eventIds = new Set(contextEvents.map((e) => e.meta.eventId))



  for (let i = 0; i < raw.length; i++) {

    const row = raw[i]

    if (!row || typeof row !== 'object') {

      return { ok: false, reason: `draft[${i}] not an object` }

    }

    const d = row as Record<string, unknown>

    if (!isNonEmptyString(d.subject) || !isNonEmptyString(d.summary)) {

      return { ok: false, reason: `draft[${i}] missing subject/summary` }

    }

    if (!isNonEmptyString(d.domain) || !isNonEmptyString(d.subcategory)) {

      return { ok: false, reason: `draft[${i}] missing domain/subcategory` }

    }

    const confidence = Number(d.confidence)

    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {

      return { ok: false, reason: `draft[${i}] invalid confidence` }

    }

    const evidenceEventIds = Array.isArray(d.evidenceEventIds)

      ? d.evidenceEventIds.filter((x): x is string => typeof x === 'string')

      : []

    if (evidenceEventIds.length === 0) {

      return { ok: false, reason: `draft[${i}] missing evidenceEventIds` }

    }

    if (!evidenceEventIds.every((id) => eventIds.has(id))) {

      return { ok: false, reason: `draft[${i}] references unknown event id` }

    }



    const completionLike =

      /已完成|成功了|做完了|任务完成|执行成功/i.test(d.summary) ||

      /completed|succeeded|done successfully/i.test(d.summary)

    if (completionLike && !hasTrustedWorkSuccess(contextEvents)) {

      return { ok: false, reason: `draft[${i}] completion claim without trusted work.succeeded receipt` }

    }



    for (const id of evidenceEventIds) {

      const ev = contextEvents.find((e) => e.meta.eventId === id)

      if (!ev || !isUserChatEvidenceEvent(ev)) {

        return { ok: false, reason: `draft[${i}] evidence must be chat.user_message` }

      }

    }

    drafts.push({

      subject: d.subject.trim(),

      summary: d.summary.trim(),

      domain: d.domain.trim(),

      subcategory: d.subcategory.trim(),

      confidence,

      evidenceEventIds

    })

  }

  try {

    assertDraftsGroundedInUserEvidence(drafts, contextEvents)

  } catch (e) {

    const message = e instanceof Error ? e.message : String(e)

    return { ok: false, reason: message }

  }

  return { ok: true, drafts }

}


