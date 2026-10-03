import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'

import { getDatabase } from '../../db/database.js'

import { deleteFactFromDb, loadFactsFromDb, insertFact, updateFactInDb } from '../../db/repos/memoryFacts.js'

import type {

  MemoryControlCommand,

  MemoryControlResult,

  MemoryEventMeta,

  MemoryTarget

} from '../contracts.js'

import { EventRepository } from '../ledger/eventRepository.js'

import { TombstoneRepository } from './tombstoneRepository.js'

import { dropFactDerivedIndexes, retireFactRecord } from './invalidation.js'

import type { MemoryFact } from '../semantic/types.js'

import { zonedLocalDate } from '../temporal/zonedDate.js'

import {
  projectLegacyChatHistoryFromDb,
  purgeTurnFromDbTx,
  reconcileLegacyChatProjectionFromDb
} from './chatHistoryProjection.js'

import { buildControlIdempotencyKey } from './controlIntent.js'

import { tombstoneEvidenceEvents } from './tombstoneGuard.js'

import {
  validateSourceTurnForDeleteScope,
  validateSourceTurnForEpisodeDelete
} from './sourceTurnValidation.js'

import { invalidateUserDossier, scrubDossierSummaries } from './dossierHygiene.js'



export type MemoryControlContext = {

  sessionId: string

  timezone: string

  observedAt: string

  turnId?: string | null

}



let controlFaultHookForTests: ((phase: string) => void) | undefined



export function setControlFaultHookForTests(hook: ((phase: string) => void) | undefined): void {

  controlFaultHookForTests = hook

}



function resolveFactId(db: Database.Database, target: MemoryTarget): string | null {

  if (target.kind === 'fact') return target.factId

  if (target.kind === 'topic') {

    const row = db

      .prepare(

        `SELECT id FROM memory_facts WHERE status = 'active' AND (summary LIKE ? OR subject LIKE ?)

         ORDER BY updated_at DESC LIMIT 1`

      )

      .get(`%${target.text}%`, `%${target.text}%`) as { id: string } | undefined

    return row?.id ?? null

  }

  return null

}



function appendControlEvent(

  db: Database.Database,

  events: EventRepository,

  meta: MemoryEventMeta,

  content: Record<string, unknown>,

  summary: string

): string {

  events.append(db, meta, {

    eventId: meta.eventId,

    summary,

    content,

    contentHash: randomUUID().slice(0, 32),

    redactedAt: null

  })

  return meta.eventId

}



function redactEventPayloads(db: Database.Database, events: EventRepository, eventIds: string[], at: string): number {

  let n = 0

  for (const id of eventIds) {

    events.redactPayload(db, id, at)

    n += 1

  }

  return n

}



function evidenceEventIdsForFact(db: Database.Database, factId: string): string[] {

  return (

    db

      .prepare(`SELECT event_id FROM memory_fact_evidence WHERE fact_id = ?`)

      .all(factId) as Array<{ event_id: string }>

  ).map((r) => r.event_id)

}



function chatEventIdsForTurn(db: Database.Database, sessionId: string, turnId: string): string[] {

  return (

    db

      .prepare(

        `SELECT event_id FROM memory_events

         WHERE session_id = ? AND turn_id = ? AND nature = 'chat'`

      )

      .all(sessionId, turnId) as Array<{ event_id: string }>

  ).map((r) => r.event_id)

}



function suppressDeriveJobs(db: Database.Database, sourceEventIds: string[], at: string): void {

  if (sourceEventIds.length === 0) return

  const stmt = db.prepare(

    `UPDATE memory_jobs SET status = 'dead', last_error = 'governance_suppressed', updated_at = ?

     WHERE source_event_id = ? AND status IN ('pending', 'running')`

  )

  for (const id of sourceEventIds) {

    stmt.run(at, id)

  }

}



function existingControlByIdempotency(db: Database.Database, key: string): string | null {

  const row = db

    .prepare(`SELECT event_id FROM memory_events WHERE idempotency_key = ? LIMIT 1`)

    .get(key) as { event_id: string } | undefined

  return row?.event_id ?? null

}



export function executeMemoryControl(

  dataRoot: string,

  ctx: MemoryControlContext,

  command: MemoryControlCommand

): MemoryControlResult {

  const db = getDatabase(dataRoot)

  if (!db) {

    return { ok: false, invalidated: { facts: 0, episodes: 0, embeddings: 0, associations: 0 } }

  }



  const at = ctx.observedAt

  const invalidated = { facts: 0, episodes: 0, embeddings: 0, associations: 0 }



  const factId =

    command.target.kind === 'episode' ? null : resolveFactId(db, command.target)

  if (!factId && command.target.kind !== 'episode') {

    return { ok: false, invalidated }

  }



  const scopeId =

    command.target.kind === 'episode'

      ? command.target.episodeId

      : (factId ?? command.target.kind)

  const idempotencyKey = buildControlIdempotencyKey(command, scopeId)

  const priorEventId = existingControlByIdempotency(db, idempotencyKey)

  if (priorEventId) {
    const heal = reconcileLegacyChatProjectionFromDb(dataRoot, ctx.sessionId, { maxAttempts: 3 })
    if (heal.status === 'failed') {
      return { ok: false, controlEventId: priorEventId, invalidated, errorCode: 'projection_failed' }
    }
    return { ok: true, controlEventId: priorEventId, invalidated }
  }

  if (command.kind === 'delete' && factId) {
    const turnCheck = validateSourceTurnForDeleteScope(db, factId, ctx.turnId, command.scope)
    if (!turnCheck.ok) {
      return { ok: false, invalidated, errorCode: turnCheck.code }
    }
  }
  if (command.kind === 'delete' && command.target.kind === 'episode') {
    const turnCheck = validateSourceTurnForEpisodeDelete(
      db,
      command.target.episodeId,
      ctx.turnId,
      command.scope
    )
    if (!turnCheck.ok) {
      return { ok: false, invalidated, errorCode: turnCheck.code }
    }
  }



  const events = new EventRepository(db)

  const tombstones = new TombstoneRepository(db)

  const localDate = zonedLocalDate(new Date(at), ctx.timezone)



  const controlEventId = randomUUID()

  const baseMeta = (eventType: MemoryEventMeta['eventType']): MemoryEventMeta => ({

    eventId: controlEventId,

    schemaVersion: 1,

    sessionId: ctx.sessionId,

    turnId: ctx.turnId ?? null,

    correlationId: `control:${controlEventId}`,

    causationEventId: null,

    nature: 'memory_control',

    eventType,

    surface: 'desktop',

    actor: 'user',

    status: null,

    evidenceKind: 'user_assertion',

    confidence: 1,

    observedAt: at,

    occurredAt: at,

    scheduledFor: null,

    completedAt: at,

    timezone: ctx.timezone,

    localDate,

    idempotencyKey

  })



  let projectLegacyAfterCommit = false
  let factSummaryBefore: string | null = null
  if (command.target.kind === 'fact') {
    const factIdForSummary = command.target.factId
    factSummaryBefore =
      loadFactsFromDb(dataRoot).find((f) => f.id === factIdForSummary)?.summary ?? null
  }

  try {

    const txResult = db.transaction(() => {

      controlFaultHookForTests?.('transaction_start')



      if (command.kind === 'mute' && factId) {

        const facts = loadFactsFromDb(dataRoot)

        const fact = facts.find((f) => f.id === factId)

        if (!fact || fact.status !== 'active') return { ok: false, invalidated }

        updateFactInDb(dataRoot, { ...fact, sensitivity: 'avoid', updatedAt: at })

        appendControlEvent(db, events, baseMeta('memory.muted'), { factId, command: 'mute' }, 'memory muted')

        controlFaultHookForTests?.('before_commit')

        return { ok: true, controlEventId, invalidated }

      }



      if (command.kind === 'correct' && factId) {

        const facts = loadFactsFromDb(dataRoot)

        const old = facts.find((f) => f.id === factId)

        if (!old) return { ok: false, invalidated }

        const newId = `${factId}-corrected-${randomUUID().slice(0, 8)}`

        const replacement = command.replacement

        const newFact: MemoryFact = {

          ...old,

          id: newId,

          summary: replacement.summary,

          occurredAt: replacement.occurredAt ?? old.occurredAt,

          status: 'active',

          sensitivity: 'normal',

          createdAt: at,

          updatedAt: at,

          derivedFrom: [...(old.derivedFrom ?? []), factId]

        }

        retireFactRecord(dataRoot, old, at)

        db.prepare(`UPDATE memory_facts SET superseded_by = ? WHERE id = ?`).run(newId, factId)

        insertFact(dataRoot, newFact)

        const inv = dropFactDerivedIndexes(db, factId)

        invalidated.facts = 1

        invalidated.embeddings = inv.embeddings

        invalidated.associations = inv.associations

        appendControlEvent(

          db,

          events,

          baseMeta('memory.corrected'),

          { factId, newFactId: newId, replacement },

          'memory corrected'

        )

        controlFaultHookForTests?.('before_commit')

        return { ok: true, controlEventId, invalidated }

      }



      if (command.kind === 'forget' && factId) {

        const facts = loadFactsFromDb(dataRoot)

        const fact = facts.find((f) => f.id === factId)

        if (!fact) return { ok: false, invalidated }

        const evidenceIds = evidenceEventIdsForFact(db, factId)

        controlFaultHookForTests?.('after_invalidation')

        const inv = dropFactDerivedIndexes(db, factId)

        retireFactRecord(dataRoot, fact, at)

        invalidated.facts = 1

        invalidated.embeddings = inv.embeddings

        invalidated.associations = inv.associations

        appendControlEvent(db, events, baseMeta('memory.forgotten'), { factId }, 'memory forgotten')

        tombstones.insert(db, {

          tombstone_id: randomUUID(),

          scope_type: 'fact',

          scope_id: factId,

          reason: 'forget',

          created_at: at,

          control_event_id: controlEventId

        })

        tombstoneEvidenceEvents(

          db,

          (row) => {

            tombstones.insert(db, row)

          },

          evidenceIds,

          'forget',

          controlEventId,

          at,

          randomUUID

        )

        suppressDeriveJobs(db, evidenceIds, at)

        controlFaultHookForTests?.('before_commit')

        return { ok: true, controlEventId, invalidated }

      }



      if (command.kind === 'delete' && factId) {

        const evidenceIds = evidenceEventIdsForFact(db, factId)

        const inv = dropFactDerivedIndexes(db, factId)

        invalidated.embeddings = inv.embeddings

        invalidated.associations = inv.associations



        if (command.scope === 'memory_and_source' && ctx.turnId) {

          const chatIds = chatEventIdsForTurn(db, ctx.sessionId, ctx.turnId)

          redactEventPayloads(db, events, [...new Set([...evidenceIds, ...chatIds])], at)

          purgeTurnFromDbTx(db, dataRoot, ctx.sessionId, ctx.turnId)

          projectLegacyAfterCommit = true

        }



        deleteFactFromDb(dataRoot, factId)

        invalidated.facts = 1

        appendControlEvent(db, events, baseMeta('memory.deleted'), { factId, scope: command.scope }, 'memory deleted')

        tombstones.insert(db, {

          tombstone_id: randomUUID(),

          scope_type: 'fact',

          scope_id: factId,

          reason: 'delete',

          created_at: at,

          control_event_id: controlEventId

        })

        tombstoneEvidenceEvents(

          db,

          (row) => {

            tombstones.insert(db, row)

          },

          evidenceIds,

          'delete',

          controlEventId,

          at,

          randomUUID

        )

        suppressDeriveJobs(db, evidenceIds, at)

        controlFaultHookForTests?.('before_commit')

        return { ok: true, controlEventId, invalidated }

      }



      if (command.kind === 'delete' && command.target.kind === 'episode') {

        const episodeId = command.target.episodeId

        const evIds = (

          db

            .prepare(`SELECT event_id FROM memory_episode_evidence WHERE episode_id = ?`)

            .all(episodeId) as Array<{ event_id: string }>

        ).map((r) => r.event_id)



        if (command.scope === 'memory_and_source' && ctx.turnId) {

          const chatIds = chatEventIdsForTurn(db, ctx.sessionId, ctx.turnId)

          redactEventPayloads(db, events, [...new Set([...evIds, ...chatIds])], at)

          purgeTurnFromDbTx(db, dataRoot, ctx.sessionId, ctx.turnId)

          projectLegacyAfterCommit = true

        }



        db.prepare(`DELETE FROM episodes WHERE id = ?`).run(episodeId)

        invalidated.episodes = 1

        appendControlEvent(db, events, baseMeta('memory.deleted'), { episodeId, scope: command.scope }, 'memory deleted')

        tombstones.insert(db, {

          tombstone_id: randomUUID(),

          scope_type: 'episode',

          scope_id: episodeId,

          reason: 'delete',

          created_at: at,

          control_event_id: controlEventId

        })

        if (command.scope === 'memory_only') {

          /* keep source payloads */

        } else {

          tombstoneEvidenceEvents(

            db,

            (row) => {

              tombstones.insert(db, row)

            },

            evIds,

            'delete',

            controlEventId,

            at,

            randomUUID

          )

        }

        suppressDeriveJobs(db, evIds, at)

        controlFaultHookForTests?.('before_commit')

        return { ok: true, controlEventId, invalidated }

      }



      return { ok: false, invalidated }

    })()

    if (txResult.ok && projectLegacyAfterCommit) {
      const proj = projectLegacyChatHistoryFromDb(dataRoot, ctx.sessionId, { maxAttempts: 3 })
      if (!proj.ok) {
        return { ...txResult, ok: false, errorCode: 'projection_failed' }
      }
    }

    if (
      txResult.ok &&
      (command.kind === 'forget' || command.kind === 'delete' || command.kind === 'correct')
    ) {
      const fid = command.target.kind === 'fact' ? command.target.factId : undefined
      invalidateUserDossier(dataRoot, `governance_${command.kind}`, fid ? [fid] : undefined)
      if (factSummaryBefore) scrubDossierSummaries(dataRoot, [factSummaryBefore])
    }

    return txResult

  } catch {

    return { ok: false, invalidated }

  }

}


