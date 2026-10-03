import { getDatabase } from '../../db/database.js'

import { FactStore, defaultFactsPath } from '../factStore.js'

import { emptyFactChangeSet, noteFactChange } from '../semantic/changeSet.js'

import type { DerivedFactCandidate, FactChangeSet } from '../semantic/types.js'

import { flushFactStoreIndexProjections } from '../semantic/semanticMemory.js'
import { filterDerivedCandidatesByTombstones } from '../governance/tombstoneGuard.js'

import type { DbTx, JobRepository } from '../jobs/jobRepository.js'



export const LOST_LEASE_DURING_DERIVE = 'lost lease during derived fact apply'



export type ApplyDerivedFactsLease = {

  jobs: JobRepository

  jobId: string

  leaseOwner: string

  leaseGeneration: number

}



const DEFAULT_EMO = {

  valence: 0.4,

  intensity: 0.4,

  relStage: 'FAMILIAR' as const,

  trust: 55,

  atmosphere: 'neutral' as const

}



export type ApplyDerivedFactsResult = {

  changeSet: FactChangeSet

  factIds: string[]

}



type ApplyHookPhase = 'after_fact_before_evidence'



let applyDerivedFactsHookForTests: ((phase: ApplyHookPhase, factId: string) => void) | undefined



export function setApplyDerivedFactsHookForTests(

  hook: ((phase: ApplyHookPhase, factId: string) => void) | undefined

): void {

  applyDerivedFactsHookForTests = hook

}



function findExistingFactForCandidate(

  store: FactStore,

  c: DerivedFactCandidate,

  sessionId: string,

  turnIndex: number

): string | undefined {

  const session = sessionId

  return store

    .listActive()

    .find(

      (f) =>

        f.sourceSessionId === session &&

        f.sourceTurnIndex === turnIndex &&

        f.summary === c.summary &&

        f.subject === c.subject

    )?.id

}



function evidenceComplete(db: import('better-sqlite3').Database, factId: string, eventIds: string[]): boolean {

  if (eventIds.length === 0) return true

  const row = db

    .prepare(

      `SELECT COUNT(*) AS c FROM memory_fact_evidence

       WHERE fact_id = ? AND event_id IN (${eventIds.map(() => '?').join(',')})`

    )

    .get(factId, ...eventIds) as { c: number }

  return row.c >= eventIds.length

}



function writeDerivedFactsSync(

  store: FactStore,

  db: ReturnType<typeof getDatabase>,

  candidates: DerivedFactCandidate[],

  sessionId: string,

  turnIndex: number,

  now: string

): { changeSet: FactChangeSet; factIds: string[] } {

  const changeSet = emptyFactChangeSet()

  const factIds: string[] = []

  for (const c of candidates) {

    let factId = findExistingFactForCandidate(store, c, sessionId, turnIndex)

    let isNew = false

    if (!factId) {

      const { fact, isNew: created } = store.addFactDetailed({

        domain: c.domain,

        subcategory: c.subcategory,

        subject: c.subject,

        summary: c.summary,

        confidence: c.confidence,

        sourceSessionId: sessionId,

        sourceTurnIndex: turnIndex,

        emotionalContext: DEFAULT_EMO,

        triggers: [],

        occurredAt: c.occurredAt ?? undefined,

        scheduledFor: c.scheduledFor ?? undefined

      })

      factId = fact.id

      isNew = created

    } else if (db && evidenceComplete(db, factId, c.evidenceEventIds)) {

      factIds.push(factId)

      continue

    }

    factIds.push(factId)

    noteFactChange(changeSet, isNew ? 'inserted' : 'updated', factId)

    applyDerivedFactsHookForTests?.('after_fact_before_evidence', factId)

    if (db && c.evidenceEventIds.length > 0) {

      const ins = db.prepare(

        `INSERT INTO memory_fact_evidence(fact_id, event_id, evidence_role, created_at)

         VALUES (?, ?, 'supports', ?)

         ON CONFLICT(fact_id, event_id, evidence_role) DO NOTHING`

      )

      for (const eventId of c.evidenceEventIds) {

        ins.run(factId, eventId, now)

      }

    }

  }

  return { changeSet, factIds }

}



/** Persist derived candidates + evidence links (Task 11). Idempotent on retry (same summary/session/turn). */

export async function applyDerivedFacts(

  dataRoot: string,

  candidates: DerivedFactCandidate[],

  opts: {

    store?: FactStore

    sessionId?: string

    turnIndex?: number

    lease?: ApplyDerivedFactsLease

    finalizeInSameLease?: (tx: DbTx) => 'inserted' | 'duplicate' | 'lost_lease'

  } = {}

): Promise<ApplyDerivedFactsResult> {

  const store = opts.store ?? new FactStore(defaultFactsPath(dataRoot))

  if (!opts.store) {

    store.preferDbWrites()

    store.load()

  }

  const sessionId = opts.sessionId ?? 'default'

  const turnIndex = opts.turnIndex ?? 0

  const db = getDatabase(dataRoot)

  const now = new Date().toISOString()
  const allowedCandidates = filterDerivedCandidatesByTombstones(db, candidates)

  let result: { changeSet: FactChangeSet; factIds: string[] }

  if (opts.lease) {

    const fenced = opts.lease.jobs.withValidLease(

      opts.lease.jobId,

      opts.lease.leaseOwner,

      opts.lease.leaseGeneration,

      (tx) => {

        result = writeDerivedFactsSync(store, db, allowedCandidates, sessionId, turnIndex, now)

        if (opts.finalizeInSameLease) {

          return opts.finalizeInSameLease(tx)

        }

        return 'inserted' as const

      }

    )

    if (!fenced.ok) {

      throw new Error(LOST_LEASE_DURING_DERIVE)

    }

    if (opts.finalizeInSameLease && fenced.value === 'lost_lease') {

      throw new Error(LOST_LEASE_DURING_DERIVE)

    }

  } else {

    result = writeDerivedFactsSync(store, db, allowedCandidates, sessionId, turnIndex, now)

  }

  await flushFactStoreIndexProjections(store)

  return result!

}


