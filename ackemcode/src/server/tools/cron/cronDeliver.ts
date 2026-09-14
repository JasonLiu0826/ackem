/**
 * Deliver due cron jobs into the session queue — GM-CRON + GM-NOTIFY chain.
 * Single path shared by turn-end poll, HTTP /cron/poll, and SessionCronScheduler.
 */
import type { SessionMessageQueue, QueuedUserMessage } from '../../agent/messageQueue.js'
import { formatCronDueNotification } from '../../agent/taskNotification.js'
import type { CronDueJob, SessionCronStore } from './cronStore.js'

export type CronDeliverResult = {
  due: CronDueJob[]
  queued: QueuedUserMessage[]
}

/**
 * pollDue + enqueuePendingNotification for each job.
 * Safe to call from multiple places: pollDue advances/deletes so no double-fire.
 */
export function deliverDueCronJobs(opts: {
  store: SessionCronStore
  messageQueue?: SessionMessageQueue | null
  now?: number
}): CronDeliverResult {
  const due = opts.store.pollDue(opts.now)
  const queued: QueuedUserMessage[] = []
  if (!due.length || !opts.messageQueue) {
    return { due, queued }
  }
  for (const job of due) {
    const item = opts.messageQueue.enqueuePendingNotification(
      formatCronDueNotification(job)
    )
    if (item) queued.push(item)
  }
  return { due, queued }
}
