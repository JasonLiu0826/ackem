/**
 * Session-scoped cron jobs — CC ScheduleCronTool session path.
 * R9: durable:true jobs also persist to ~/.ackemcode/scheduled_tasks.json.
 */
import { nanoid } from 'nanoid'
import {
  cronToHuman,
  nextCronRunMs,
  parseCronExpression
} from './cronParse.js'
import {
  durableCronPath,
  loadDurableCronJobs,
  saveDurableCronJobs
} from './durableCron.js'

export const MAX_CRON_JOBS = 50
/** Recurring auto-expire after 7 days (CC DEFAULT_MAX_AGE_DAYS). */
export const RECURRING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type CronJob = {
  id: string
  cron: string
  prompt: string
  recurring: boolean
  createdAt: number
  nextRunAt: number
  /** Last successful fire (GM-CRON observability). */
  lastFiredAt?: number
  /** How many times this job has fired in-session. */
  fireCount: number
  /**
   * R9: when true, job is persisted across process restarts.
   * Session-only jobs (false/undefined) are unchanged.
   */
  durable?: boolean
}

export type CronDueJob = {
  id: string
  cron: string
  prompt: string
  humanSchedule: string
  recurring: boolean
  fireCount: number
  durable?: boolean
}

export class SessionCronStore {
  private jobs = new Map<string, CronJob>()
  private persistPath: string
  private persistEnabled: boolean
  /** Serialize durable writes so concurrent poll/delete don't race. */
  private persistChain: Promise<void> = Promise.resolve()

  constructor(opts?: { persistPath?: string; loadDurable?: boolean }) {
    this.persistPath = opts?.persistPath ?? durableCronPath()
    this.persistEnabled = process.env.ACKEM_DISABLE_DURABLE_CRON !== '1'
    // Sync hydrate is deferred — call hydrateDurable() before first use when
    // constructing from a cold process. Smoke/tests call it explicitly or
    // pass preloaded jobs via seedDurable.
  }

  /** Absolute path of the durable file (for tests / diagnostics). */
  getPersistPath(): string {
    return this.persistPath
  }

  /**
   * Contract 2: load durable jobs from disk. Missed recurring windows keep
   * their past nextRunAt so the next pollDue fires them exactly once, then
   * advances — no stampede of catch-up fires.
   */
  async hydrateDurable(): Promise<number> {
    if (!this.persistEnabled) return 0
    const loaded = await loadDurableCronJobs(this.persistPath)
    let n = 0
    for (const job of loaded) {
      if (this.jobs.has(job.id)) continue
      this.jobs.set(job.id, { ...job, durable: true })
      n += 1
    }
    return n
  }

  /** Test helper: inject durable jobs without touching disk. */
  seedDurable(jobs: CronJob[]): void {
    for (const job of jobs) {
      this.jobs.set(job.id, { ...job, durable: true })
    }
  }

  private schedulePersist(): void {
    if (!this.persistEnabled) return
    const snapshot = [...this.jobs.values()].filter((j) => j.durable)
    this.persistChain = this.persistChain
      .then(() => saveDurableCronJobs(snapshot, this.persistPath))
      .catch(() => {
        /* fail-soft — never break the store */
      })
  }

  /** Await outstanding durable writes (tests / graceful shutdown). */
  async flushPersist(): Promise<void> {
    await this.persistChain
  }

  create(input: {
    cron: string
    prompt: string
    recurring?: boolean
    /** R9: persist across restarts */
    durable?: boolean
  }): { ok: true; job: CronJob; humanSchedule: string } | { ok: false; error: string } {
    if (!parseCronExpression(input.cron)) {
      return {
        ok: false,
        error: `Invalid cron expression '${input.cron}'. Expected 5 fields: M H DoM Mon DoW.`
      }
    }
    const next = nextCronRunMs(input.cron, Date.now())
    if (next === null) {
      return {
        ok: false,
        error: `Cron expression '${input.cron}' does not match any calendar date in the next year.`
      }
    }
    if (this.jobs.size >= MAX_CRON_JOBS) {
      return {
        ok: false,
        error: `Too many scheduled jobs (max ${MAX_CRON_JOBS}). Cancel one first.`
      }
    }
    const recurring = input.recurring !== false
    const durable = input.durable === true
    const job: CronJob = {
      id: nanoid(10),
      cron: input.cron.trim(),
      prompt: input.prompt,
      recurring,
      createdAt: Date.now(),
      nextRunAt: next,
      fireCount: 0,
      ...(durable ? { durable: true } : {})
    }
    this.jobs.set(job.id, job)
    if (durable) this.schedulePersist()
    return { ok: true, job, humanSchedule: cronToHuman(job.cron) }
  }

  delete(id: string): boolean {
    const existing = this.jobs.get(id)
    const ok = this.jobs.delete(id)
    if (ok && existing?.durable) this.schedulePersist()
    return ok
  }

  get(id: string): CronJob | undefined {
    const j = this.jobs.get(id)
    return j ? { ...j } : undefined
  }

  list(): Array<CronJob & { humanSchedule: string }> {
    return [...this.jobs.values()].map((j) => ({
      ...j,
      humanSchedule: cronToHuman(j.cron)
    }))
  }

  /** Soonest nextRunAt across jobs, or null when empty. */
  getNextFireTime(): number | null {
    let best: number | null = null
    for (const j of this.jobs.values()) {
      if (best == null || j.nextRunAt < best) best = j.nextRunAt
    }
    return best
  }

  /** Test / host helper: force next fire time. */
  setNextRunAt(id: string, nextRunAt: number): boolean {
    const j = this.jobs.get(id)
    if (!j) return false
    j.nextRunAt = nextRunAt
    if (j.durable) this.schedulePersist()
    return true
  }

  /**
   * Return due jobs and advance/delete them (CC fire-on-idle spirit).
   * One-shot → removed; recurring → nextRunAt advanced + lastFiredAt stamped.
   * Durable mutations are persisted after the sweep.
   */
  pollDue(now = Date.now()): CronDueJob[] {
    const due: CronDueJob[] = []
    let durableTouched = false
    for (const job of [...this.jobs.values()]) {
      if (job.recurring && now - job.createdAt > RECURRING_MAX_AGE_MS) {
        this.jobs.delete(job.id)
        if (job.durable) durableTouched = true
        continue
      }
      if (job.nextRunAt > now) continue

      job.fireCount += 1
      job.lastFiredAt = now
      due.push({
        id: job.id,
        cron: job.cron,
        prompt: job.prompt,
        humanSchedule: cronToHuman(job.cron),
        recurring: job.recurring,
        fireCount: job.fireCount,
        durable: job.durable
      })

      if (!job.recurring) {
        this.jobs.delete(job.id)
        if (job.durable) durableTouched = true
      } else {
        // Anchor from now so we don't immediately re-fire the same minute
        // (also implements "missed window catch-up once" for hydrated jobs).
        const next = nextCronRunMs(job.cron, now + 1000)
        if (next == null) {
          this.jobs.delete(job.id)
        } else {
          job.nextRunAt = next
          this.jobs.set(job.id, job)
        }
        if (job.durable) durableTouched = true
      }
    }
    if (durableTouched) this.schedulePersist()
    return due
  }
}

export function isCronEnabled(): boolean {
  const v = process.env.ACKEM_ENABLE_CRON ?? process.env.CLAUDE_CODE_DISABLE_CRON
  if (process.env.CLAUDE_CODE_DISABLE_CRON === '1') return false
  // Default ON for Ackem session cron (no Kairos gate); set ACKEM_ENABLE_CRON=0 to disable
  if (v === '0' || v === 'false') return false
  return true
}
