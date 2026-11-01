/**
 * Collapse consecutive completed task-notifications — Claude Code
 * collapseBackgroundBashNotifications spirit (Ackem-owned; agents + cron).
 * Failed/killed stay individual. Verbose mode disables collapse.
 */
import {
  formatTaskNotificationXml,
  type TaskNotificationStatus
} from './taskNotification.js'
import type { QueuedUserMessage } from './messageQueue.js'
import { formatQueuedAttachmentsForModel } from './queueAttachments.js'

export function isNotifyCollapseVerbose(): boolean {
  const v = process.env.ACKEM_NOTIFY_VERBOSE
  return v === '1' || v === 'true'
}

/** Extract <status>…</status> from a task-notification blob. */
export function extractTaskNotificationStatus(
  text: string
): TaskNotificationStatus | null {
  const m = text.match(/<status>\s*(completed|failed|killed)\s*<\/status>/i)
  if (!m) return null
  return m[1]!.toLowerCase() as TaskNotificationStatus
}

export function isCompletedTaskNotificationText(text: string): boolean {
  return (
    /<task-notification[\s>]/i.test(text) &&
    extractTaskNotificationStatus(text) === 'completed'
  )
}

/**
 * Collapse consecutive completed task-notification queue items into one
 * synthetic notification. Prompts / slash / failed / killed untouched.
 */
export function collapseQueuedTaskNotifications(
  items: QueuedUserMessage[]
): QueuedUserMessage[] {
  if (isNotifyCollapseVerbose() || items.length < 2) return items

  const out: QueuedUserMessage[] = []
  let i = 0
  while (i < items.length) {
    const cur = items[i]!
    if (
      cur.mode === 'task-notification' &&
      isCompletedTaskNotificationText(cur.text)
    ) {
      let count = 0
      const ids: string[] = []
      while (
        i < items.length &&
        items[i]!.mode === 'task-notification' &&
        isCompletedTaskNotificationStatus(items[i]!)
      ) {
        ids.push(items[i]!.id)
        count++
        i++
      }
      if (count === 1) {
        out.push(cur)
      } else {
        out.push({
          id: ids[0]!,
          text: formatTaskNotificationXml({
            taskId: `collapsed:${ids.length}`,
            status: 'completed',
            summary: `${count} background tasks completed`,
            result: `collapsed task-ids: ${ids.join(', ')}`
          }),
          mode: 'task-notification',
          priority: cur.priority,
          enqueuedAt: cur.enqueuedAt
        })
      }
      continue
    }
    out.push(cur)
    i++
  }
  return out
}

function isCompletedTaskNotificationStatus(item: QueuedUserMessage): boolean {
  return isCompletedTaskNotificationText(item.text)
}

/**
 * Format items for a single user turn (idle pump / between-turn join).
 * Applies collapse first.
 */
export function formatQueueBatchUserText(items: QueuedUserMessage[]): string {
  return formatQueuedAttachmentsForModel(items)
}
