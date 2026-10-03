/**
 * B7-Q01 — mid-turn queue inject as attachment blocks (CC mid-turn attachment spirit).
 */
import { collapseQueuedTaskNotifications } from './notifyCollapse.js'
import type { QueuedUserMessage } from './messageQueue.js'

export function formatQueuedItemBlock(item: QueuedUserMessage): string {
  const source =
    item.mode === 'task-notification' ? 'task_notification' : 'queue_inject'
  return [
    `<attachment kind="queue" source="${source}" mode="${item.mode}" priority="${item.priority}" id="${item.id}">`,
    item.text,
    '</attachment>'
  ].join('\n')
}

export function formatQueuedAttachmentsForModel(
  items: QueuedUserMessage[]
): string {
  const collapsed = collapseQueuedTaskNotifications(items)
  if (!collapsed.length) return ''
  const blocks = collapsed.map(formatQueuedItemBlock)
  return [
    '<system-reminder>',
    'The following queued messages were injected mid-turn (not a new user instruction).',
    '</system-reminder>',
    '',
    ...blocks
  ].join('\n')
}
