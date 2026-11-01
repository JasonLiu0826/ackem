/**
 * Session cron ticker — Claude Code utils/cronScheduler spirit (Ackem-owned).
 * 1s check when jobs exist; fires → deliverDueCronJobs → optional idle pump.
 * No durable file / Kairos (session-only).
 */
import type { SessionMessageQueue } from '../../agent/messageQueue.js'
import { deliverDueCronJobs, type CronDeliverResult } from './cronDeliver.js'
import { isCronEnabled, type SessionCronStore } from './cronStore.js'

export type CronSchedulerHooks = {
  getStore: () => SessionCronStore
  getQueue: () => SessionMessageQueue
  /** Emit cron_due + message_queued (host SSE). */
  onDeliver?: (result: CronDeliverResult) => void
  scheduleIdlePump?: () => void
  isTurnRunning?: () => boolean
  /** Default 1000ms (CC check timer spirit). */
  intervalMs?: number
}

export class SessionCronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private hooks: CronSchedulerHooks | null = null
  private running = false

  bind(hooks: CronSchedulerHooks): void {
    this.hooks = hooks
  }

  isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    if (!this.hooks) return
    this.running = true
    const ms = Math.max(250, this.hooks.intervalMs ?? 1000)
    this.timer = setInterval(() => {
      try {
        this.check()
      } catch (e) {
        console.error('cron scheduler check failed', e)
      }
    }, ms)
    // Unref so Node can exit in scripts/tests if nothing else holds the loop
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      ;(this.timer as NodeJS.Timeout).unref?.()
    }
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Epoch ms of soonest nextRunAt, or null. */
  getNextFireTime(): number | null {
    const store = this.hooks?.getStore()
    if (!store) return null
    return store.getNextFireTime()
  }

  /**
   * One tick (also used by smoke tests). No-op when cron disabled or no jobs.
   */
  check(now = Date.now()): CronDeliverResult {
    const empty: CronDeliverResult = { due: [], queued: [] }
    if (!this.hooks) return empty
    if (!isCronEnabled()) return empty
    const store = this.hooks.getStore()
    if (!store.list().length) return empty

    const result = deliverDueCronJobs({
      store,
      messageQueue: this.hooks.getQueue(),
      now
    })
    if (!result.due.length) return result

    this.hooks.onDeliver?.(result)
    if (!this.hooks.isTurnRunning?.()) {
      this.hooks.scheduleIdlePump?.()
    }
    return result
  }
}
