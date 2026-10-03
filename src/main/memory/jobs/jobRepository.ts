import type Database from 'better-sqlite3'

import { JobIdConflictError } from '../ledger/errors.js'
import { clampQueryLimit } from '../ledger/queryLimit.js'
import { DEFAULT_JOB_MAX_ATTEMPTS, nextBackoffIso } from './jobBackoff.js'

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead'

export type MemoryJobRow = {
  job_id: string
  source_event_id: string
  session_id: string
  job_type: string
  derivation_version: number
  status: JobStatus
  attempts: number
  available_at: string
  lease_until: string | null
  lease_owner: string | null
  lease_generation: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export type DbTx = Database.Database

function isNaturalJobKeyConflict(message: string): boolean {
  return (
    /memory_jobs\.source_event_id/i.test(message) &&
    /memory_jobs\.job_type/i.test(message) &&
    /memory_jobs\.derivation_version/i.test(message)
  )
}

function isJobIdPrimaryKeyConflict(message: string): boolean {
  return /memory_jobs\.job_id/i.test(message) && !isNaturalJobKeyConflict(message)
}

export type ClaimOptions = {
  now: string
  workerId: string
  batchSize: number
  leaseSeconds: number
  maxGlobalRunning: number
}

export class JobRepository {
  private readonly insertJob
  private readonly listClaimableStmt
  private readonly selectById

  constructor(private readonly db: Database.Database) {
    this.insertJob = db.prepare(`
      INSERT INTO memory_jobs (
        job_id, source_event_id, session_id, job_type, derivation_version, status,
        attempts, available_at, lease_until, lease_owner, lease_generation, last_error, created_at, updated_at
      ) VALUES (
        @job_id, @source_event_id, @session_id, @job_type, @derivation_version, @status,
        @attempts, @available_at, @lease_until, @lease_owner, @lease_generation, @last_error, @created_at, @updated_at
      )
    `)
    this.listClaimableStmt = db.prepare(`
      SELECT * FROM memory_jobs
      WHERE status = 'pending' AND available_at <= ?
        AND (lease_until IS NULL OR lease_until < ?)
      ORDER BY available_at ASC
      LIMIT ?
    `)
    this.selectById = db.prepare(`SELECT * FROM memory_jobs WHERE job_id = ?`)
  }

  enqueue(tx: DbTx, row: MemoryJobRow): 'inserted' | 'duplicate' {
    try {
      this.insertJob.run({
        ...row,
        lease_owner: row.lease_owner ?? null,
        lease_generation: row.lease_generation ?? 0
      })
      return 'inserted'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/UNIQUE constraint failed/i.test(msg)) {
        if (isNaturalJobKeyConflict(msg)) return 'duplicate'
        if (isJobIdPrimaryKeyConflict(msg)) throw new JobIdConflictError(row.job_id)
      }
      throw e
    }
  }

  listClaimableJobs(now: string, limit: number): MemoryJobRow[] {
    const lim = clampQueryLimit(limit)
    return this.listClaimableStmt.all(now, now, lim) as MemoryJobRow[]
  }

  getById(jobId: string): MemoryJobRow | null {
    return (this.selectById.get(jobId) as MemoryJobRow | undefined) ?? null
  }

  countRunning(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM memory_jobs WHERE status = 'running'`).get() as {
      c: number
    }
    return row.c
  }

  sessionHasRunning(sessionId: string, excludeJobId?: string): boolean {
    const row = excludeJobId
      ? (this.db
          .prepare(
            `SELECT COUNT(*) AS c FROM memory_jobs WHERE status = 'running' AND session_id = ? AND job_id != ?`
          )
          .get(sessionId, excludeJobId) as { c: number })
      : (this.db
          .prepare(`SELECT COUNT(*) AS c FROM memory_jobs WHERE status = 'running' AND session_id = ?`)
          .get(sessionId) as { c: number })
    return row.c > 0
  }

  /** Expired running jobs return to pending for reclaim. */
  recoverStaleLeases(now: string): number {
    const result = this.db
      .prepare(
        `UPDATE memory_jobs
         SET status = 'pending', lease_until = NULL, lease_owner = NULL, updated_at = ?
         WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until < ?`
      )
      .run(now, now)
    return result.changes
  }

  /**
   * Atomically claim up to batchSize jobs respecting session serial + global parallel cap.
   */
  claimBatch(opts: ClaimOptions): MemoryJobRow[] {
    const leaseUntil = new Date(Date.parse(opts.now) + opts.leaseSeconds * 1000).toISOString()
    const claimed: MemoryJobRow[] = []
    this.db.transaction(() => {
      const candidates = this.listClaimableJobs(opts.now, opts.batchSize)
      for (const job of candidates) {
        if (this.countRunning() >= opts.maxGlobalRunning) break
        if (this.sessionHasRunning(job.session_id)) continue
        const updated = this.db
          .prepare(
            `UPDATE memory_jobs
             SET status = 'running',
                 attempts = attempts + 1,
                 lease_until = ?,
                 lease_owner = ?,
                 lease_generation = lease_generation + 1,
                 updated_at = ?,
                 last_error = NULL
             WHERE job_id = ?
               AND status = 'pending'
               AND available_at <= ?
               AND (lease_until IS NULL OR lease_until < ?)`
          )
          .run(leaseUntil, opts.workerId, opts.now, job.job_id, opts.now, opts.now)
        if (updated.changes === 1) {
          const row = this.getById(job.job_id)
          if (row) claimed.push(row)
        }
      }
    })()
    return claimed
  }

  complete(jobId: string, workerId: string, leaseGeneration: number, now: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE memory_jobs
         SET status = 'succeeded', lease_until = NULL, lease_owner = NULL, updated_at = ?
         WHERE job_id = ? AND status = 'running' AND lease_owner = ? AND lease_generation = ?`
      )
      .run(now, jobId, workerId, leaseGeneration)
    return result.changes === 1
  }

  fail(
    jobId: string,
    workerId: string,
    leaseGeneration: number,
    now: string,
    error: string,
    opts: { retryable: boolean }
  ): 'retry' | 'dead' | 'lost' {
    const row = this.getById(jobId)
    if (!row || row.status !== 'running' || row.lease_owner !== workerId) return 'lost'
    if (row.lease_generation !== leaseGeneration) return 'lost'
    if (!opts.retryable) {
      this.db
        .prepare(
          `UPDATE memory_jobs
           SET status = 'dead', lease_until = NULL, lease_owner = NULL, last_error = ?, updated_at = ?
           WHERE job_id = ? AND lease_owner = ? AND lease_generation = ?`
        )
        .run(error.slice(0, 500), now, jobId, workerId, leaseGeneration)
      return 'dead'
    }
    if (row.attempts >= DEFAULT_JOB_MAX_ATTEMPTS) {
      this.db
        .prepare(
          `UPDATE memory_jobs
           SET status = 'dead', lease_until = NULL, lease_owner = NULL, last_error = ?, updated_at = ?
           WHERE job_id = ? AND lease_owner = ? AND lease_generation = ?`
        )
        .run(error.slice(0, 500), now, jobId, workerId, leaseGeneration)
      return 'dead'
    }
    const availableAt = nextBackoffIso(now, row.attempts)
    this.db
      .prepare(
        `UPDATE memory_jobs
         SET status = 'pending', available_at = ?, lease_until = NULL, lease_owner = NULL,
             last_error = ?, updated_at = ?
         WHERE job_id = ? AND lease_owner = ? AND lease_generation = ?`
      )
      .run(availableAt, error.slice(0, 500), now, jobId, workerId, leaseGeneration)
    return 'retry'
  }

  /** Admin / audit: dead → pending with fresh schedule; bumps updated_at, clears lease. */
  retryDead(jobId: string, now: string): 'revived' | 'missing' | 'not_dead' {
    const row = this.getById(jobId)
    if (!row) return 'missing'
    if (row.status !== 'dead') return 'not_dead'
    this.db
      .prepare(
        `UPDATE memory_jobs
         SET status = 'pending', attempts = 0, available_at = ?, lease_until = NULL,
             lease_owner = NULL, last_error = NULL, updated_at = ?
         WHERE job_id = ? AND status = 'dead'`
      )
      .run(now, now, jobId)
    return 'revived'
  }

  hasEffect(
    sourceEventId: string,
    jobType: string,
    derivationVersion: number,
    effectKey: string
  ): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM memory_job_effects
         WHERE source_event_id = ? AND job_type = ? AND derivation_version = ? AND effect_key = ?`
      )
      .get(sourceEventId, jobType, derivationVersion, effectKey)
    return Boolean(row)
  }

  recordEffect(
    tx: DbTx,
    sourceEventId: string,
    jobType: string,
    derivationVersion: number,
    effectKey: string,
    createdAt: string
  ): 'inserted' | 'duplicate' {
    try {
      tx.prepare(
        `INSERT INTO memory_job_effects (source_event_id, job_type, derivation_version, effect_key, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(sourceEventId, jobType, derivationVersion, effectKey, createdAt)
      return 'inserted'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/UNIQUE constraint failed/i.test(msg)) return 'duplicate'
      throw e
    }
  }

  /**
   * Lease check + effect insert in one SQLite transaction (Task 9 fencing).
   */
  recordEffectIfLeaseValid(
    jobId: string,
    leaseOwner: string,
    leaseGeneration: number,
    sourceEventId: string,
    jobType: string,
    derivationVersion: number,
    effectKey: string,
    createdAt: string
  ): 'inserted' | 'duplicate' | 'lost_lease' {
    const result = this.withValidLease(jobId, leaseOwner, leaseGeneration, (tx) =>
      this.recordEffect(tx, sourceEventId, jobType, derivationVersion, effectKey, createdAt)
    )
    return result.ok ? result.value : 'lost_lease'
  }

  /** Fences a derived write and its lease check in the same SQLite transaction. */
  withValidLease<T>(
    jobId: string,
    leaseOwner: string,
    leaseGeneration: number,
    write: (tx: DbTx) => T
  ): { ok: true; value: T } | { ok: false } {
    return this.db.transaction(() => {
      const row = this.db.prepare(
        `SELECT status, lease_owner, lease_generation FROM memory_jobs WHERE job_id = ?`
      ).get(jobId) as
        | { status: JobStatus; lease_owner: string | null; lease_generation: number }
        | undefined
      if (!row || row.status !== 'running' || row.lease_owner !== leaseOwner ||
          row.lease_generation !== leaseGeneration) {
        return { ok: false as const }
      }
      return { ok: true as const, value: write(this.db) }
    })()
  }
}
