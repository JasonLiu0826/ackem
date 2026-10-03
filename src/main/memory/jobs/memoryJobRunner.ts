import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../db/database.js'
import type { JobRunReport, MemoryJobRunner, TrustedHostReceipt } from '../contracts.js'
import { dispatchJobHandler } from './jobHandlers.js'
import { getJobRunCoordinator } from './jobRunCoordinator.js'
import { JobRepository, type MemoryJobRow } from './jobRepository.js'

export type MemoryJobRunnerOptions = {
  dataRoot: string
  batchSize?: number
  leaseSeconds?: number
  maxGlobalRunning?: number
  pollMs?: number
  loadHostReceipt?: (runtimeId: string) => Promise<TrustedHostReceipt | undefined>
  /** When false, start() does not enqueue an immediate tick (tests). */
  eagerFirstTick?: boolean
}

const DEFAULT_BATCH = 8
const DEFAULT_LEASE_SEC = 60
const DEFAULT_MAX_RUNNING = 2
const DEFAULT_POLL_MS = 2_000

export function createMemoryJobRunner(opts: MemoryJobRunnerOptions): MemoryJobRunner {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH
  const leaseSeconds = opts.leaseSeconds ?? DEFAULT_LEASE_SEC
  const maxGlobalRunning = opts.maxGlobalRunning ?? DEFAULT_MAX_RUNNING
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS
  const eagerFirstTick = opts.eagerFirstTick !== false
  const workerId = randomUUID()
  const coordinator = getJobRunCoordinator(opts.dataRoot, maxGlobalRunning)

  let timer: ReturnType<typeof setInterval> | null = null
  let claimsEnabled = false

  const dbOrNull = () => getDatabase(opts.dataRoot)

  async function processClaimedJob(job: MemoryJobRow, now: string, jobs: JobRepository): Promise<void> {
    const leaseOwner = job.lease_owner ?? workerId
    const leaseGeneration = job.lease_generation
    await coordinator.acquire(job.session_id)
    try {
      const result = await dispatchJobHandler(job, {
        dataRoot: opts.dataRoot,
        nowIso: now,
        loadHostReceipt: opts.loadHostReceipt,
        leaseGeneration
      })
      const fresh = jobs.getById(job.job_id)
      if (
        !fresh ||
        fresh.status !== 'running' ||
        fresh.lease_owner !== leaseOwner ||
        fresh.lease_generation !== leaseGeneration
      ) {
        return
      }
      if (result.ok) {
        jobs.complete(job.job_id, leaseOwner, leaseGeneration, now)
        return
      }
      jobs.fail(job.job_id, leaseOwner, leaseGeneration, now, result.message, {
        retryable: result.retryable
      })
    } finally {
      coordinator.release(job.session_id)
    }
  }

  async function runOnceInner(now: string): Promise<JobRunReport> {
    const started = Date.now()
    const report: JobRunReport = { claimed: 0, succeeded: 0, retried: 0, dead: 0, elapsedMs: 0 }
    if (!claimsEnabled) {
      report.elapsedMs = Date.now() - started
      return report
    }
    const db = dbOrNull()
    if (!db) {
      report.elapsedMs = Date.now() - started
      return report
    }
    const jobs = new JobRepository(db)
    jobs.recoverStaleLeases(now)
    if (!claimsEnabled) {
      report.elapsedMs = Date.now() - started
      return report
    }
    const claimed = jobs.claimBatch({
      now,
      workerId,
      batchSize,
      leaseSeconds,
      maxGlobalRunning
    })
    report.claimed = claimed.length
    const outcomes = await Promise.all(
      claimed.map(async (job) => {
        await processClaimedJob(job, now, jobs)
        const row = jobs.getById(job.job_id)
        if (row?.status === 'succeeded') return 'succeeded' as const
        if (row?.status === 'dead') return 'dead' as const
        if (row?.status === 'pending' && row.last_error) return 'retry' as const
        return 'other' as const
      })
    )
    for (const o of outcomes) {
      if (o === 'succeeded') report.succeeded += 1
      else if (o === 'dead') report.dead += 1
      else if (o === 'retry') report.retried += 1
    }
    report.elapsedMs = Date.now() - started
    return report
  }

  function runOnce(now: string): Promise<JobRunReport> {
    if (!claimsEnabled) {
      return Promise.resolve({
        claimed: 0,
        succeeded: 0,
        retried: 0,
        dead: 0,
        elapsedMs: 0
      })
    }
    return coordinator.scheduleTick(() => runOnceInner(now))
  }

  return {
    start() {
      if (timer) return
      claimsEnabled = true
      if (eagerFirstTick) void runOnce(new Date().toISOString())
      timer = setInterval(() => {
        if (!claimsEnabled) return
        void runOnce(new Date().toISOString())
      }, pollMs)
    },
    stop() {
      claimsEnabled = false
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    runOnce,
    retryDead(jobId: string) {
      const db = dbOrNull()
      if (!db) return
      new JobRepository(db).retryDead(jobId, new Date().toISOString())
    }
  }
}
