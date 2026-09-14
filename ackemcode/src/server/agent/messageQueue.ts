/**
 * Session command/message queue — Claude Code messageQueueManager /
 * queueProcessor spirit.
 *
 * Priority: now > next > later (FIFO within same priority).
 * Modes: prompt | task-notification | slash
 * Mid-turn drain: prompt + task-notification only (slash waits for between-turn).
 * GM-NOTIFY: enqueuePendingNotification (later) + collapse on inject.
 */
import { nanoid } from 'nanoid'
import type { ChatMessage } from '../../shared/types.js'
import { formatQueuedAttachmentsForModel } from './queueAttachments.js'
import { isBackgroundTasksDisabled } from './taskNotification.js'

export type QueuePriority = 'now' | 'next' | 'later'

/** CC QueuedCommand.mode subset used by Ackem. */
export type QueueMode = 'prompt' | 'task-notification' | 'slash'

export type QueuedUserMessage = {
  id: string
  text: string
  mode: QueueMode
  priority: QueuePriority
  enqueuedAt: string
  /** CC QueuedCommand.agentId — undefined = main session recipient. */
  agentId?: string
}

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2
}

/** Mid-turn inline modes (CC INLINE_NOTIFICATION_MODES). */
const MID_TURN_MODES = new Set<QueueMode>(['prompt', 'task-notification'])

export function isSlashText(text: string): boolean {
  return text.trim().startsWith('/')
}

export function detectQueueMode(
  text: string,
  explicit?: QueueMode
): QueueMode {
  if (explicit === 'task-notification') return 'task-notification'
  if (explicit === 'slash' || (explicit !== 'prompt' && isSlashText(text))) {
    return 'slash'
  }
  return 'prompt'
}

function sortByPriorityFifo(items: QueuedUserMessage[]): QueuedUserMessage[] {
  return [...items].sort((a, b) => {
    const d = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (d !== 0) return d
    return a.enqueuedAt.localeCompare(b.enqueuedAt)
  })
}

export class SessionMessageQueue {
  private items: QueuedUserMessage[] = []

  get length(): number {
    return this.items.length
  }

  peekAll(): QueuedUserMessage[] {
    return [...this.items]
  }

  /** Highest-priority item (CC peek), optional filter. */
  peek(
    filter?: (cmd: QueuedUserMessage) => boolean
  ): QueuedUserMessage | undefined {
    let best: QueuedUserMessage | undefined
    let bestPri = Infinity
    for (const cmd of this.items) {
      if (filter && !filter(cmd)) continue
      const p = PRIORITY_ORDER[cmd.priority]
      if (
        p < bestPri ||
        (p === bestPri &&
          best &&
          cmd.enqueuedAt.localeCompare(best.enqueuedAt) < 0)
      ) {
        bestPri = p
        best = cmd
      }
    }
    return best
  }

  enqueue(
    text: string,
    opts?: {
      priority?: QueuePriority
      mode?: QueueMode
      id?: string
      agentId?: string
    }
  ): QueuedUserMessage {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('empty_queue_text')
    const item: QueuedUserMessage = {
      id: opts?.id ?? nanoid(),
      text: trimmed,
      mode: detectQueueMode(trimmed, opts?.mode),
      priority: opts?.priority ?? 'next',
      enqueuedAt: new Date().toISOString(),
      agentId: opts?.agentId
    }
    this.items.push(item)
    return item
  }

  /**
   * CC enqueuePendingNotification spirit: system/async notices default to
   * `later` so user `next` prompts are never starved. Returns null when
   * background tasks are disabled (fail-soft, no throw).
   */
  enqueuePendingNotification(
    text: string,
    opts?: { id?: string; priority?: QueuePriority; agentId?: string }
  ): QueuedUserMessage | null {
    if (isBackgroundTasksDisabled()) return null
    return this.enqueue(text, {
      id: opts?.id,
      mode: 'task-notification',
      priority: opts?.priority ?? 'later',
      agentId: opts?.agentId
    })
  }

  byMaxPriority(maxPriority: QueuePriority = 'next'): QueuedUserMessage[] {
    const threshold = PRIORITY_ORDER[maxPriority]
    return this.items.filter(
      (cmd) => PRIORITY_ORDER[cmd.priority] <= threshold
    )
  }

  hasNowPriority(): boolean {
    return this.items.some((c) => c.priority === 'now')
  }

  /**
   * Mid-turn drain (CC query.ts): prompt + task-notification up to maxPriority,
   * sorted now→next→later, FIFO within tier. Slash excluded.
   */
  drainMidTurn(
    maxPriority: QueuePriority = 'next',
    filter?: (cmd: QueuedUserMessage) => boolean
  ): QueuedUserMessage[] {
    const threshold = PRIORITY_ORDER[maxPriority]
    const taken: QueuedUserMessage[] = []
    const remain: QueuedUserMessage[] = []
    for (const item of this.items) {
      if (filter && !filter(item)) {
        remain.push(item)
        continue
      }
      if (
        MID_TURN_MODES.has(item.mode) &&
        PRIORITY_ORDER[item.priority] <= threshold
      ) {
        taken.push(item)
      } else {
        remain.push(item)
      }
    }
    this.items = remain
    return sortByPriorityFifo(taken)
  }

  /**
   * @deprecated prefer drainMidTurn — kept for callers; same mid-turn rules.
   */
  drain(maxPriority: QueuePriority = 'next'): QueuedUserMessage[] {
    return this.drainMidTurn(maxPriority)
  }

  /**
   * Between-turn batch (CC processQueueIfReady):
   * - slash → single item
   * - else drain all same-mode non-slash at highest priority head
   */
  takeBetweenTurnBatch(
    filter?: (cmd: QueuedUserMessage) => boolean
  ): QueuedUserMessage[] {
    const next = this.peek(filter)
    if (!next) return []

    if (next.mode === 'slash' || isSlashText(next.text)) {
      const idx = this.items.findIndex((c) => c.id === next.id)
      if (idx >= 0) this.items.splice(idx, 1)
      return [{ ...next, mode: 'slash' }]
    }

    const targetMode = next.mode
    const matched: QueuedUserMessage[] = []
    const remain: QueuedUserMessage[] = []
    for (const cmd of this.items) {
      // targetMode is never 'slash' here (handled above)
      if (
        cmd.mode === targetMode &&
        !isSlashText(cmd.text) &&
        (!filter || filter(cmd))
      ) {
        matched.push(cmd)
      } else {
        remain.push(cmd)
      }
    }
    this.items = remain
    return sortByPriorityFifo(matched)
  }

  removeByIds(ids: string[]): QueuedUserMessage[] {
    const want = new Set(ids)
    const removed: QueuedUserMessage[] = []
    const remain: QueuedUserMessage[] = []
    for (const item of this.items) {
      if (want.has(item.id)) removed.push(item)
      else remain.push(item)
    }
    this.items = remain
    return removed
  }

  /** Reorder to match ids (unlisted items append in prior relative order). */
  reorder(ids: string[]): QueuedUserMessage[] {
    const map = new Map(this.items.map((i) => [i.id, i]))
    const next: QueuedUserMessage[] = []
    for (const id of ids) {
      const item = map.get(id)
      if (item) {
        next.push(item)
        map.delete(id)
      }
    }
    for (const item of this.items) {
      if (map.has(item.id)) next.push(item)
    }
    this.items = next
    return this.peekAll()
  }

  setPriority(id: string, priority: QueuePriority): QueuedUserMessage | null {
    const item = this.items.find((i) => i.id === id)
    if (!item) return null
    item.priority = priority
    return item
  }

  clear(): QueuedUserMessage[] {
    const all = this.items
    this.items = []
    return all
  }
}

/** Inject drained prompts as user messages (CC queued_command → user message). */
/** Main session: unscoped queue items (CC isMainThread). */
export function isMainSessionQueueItem(cmd: QueuedUserMessage): boolean {
  return cmd.agentId === undefined
}

/** Sub-agent: only task-notifications addressed to this agentId (CC query.ts). */
export function isSubAgentTaskNotification(
  cmd: QueuedUserMessage,
  agentId: string
): boolean {
  return cmd.mode === 'task-notification' && cmd.agentId === agentId
}

export function injectQueuedMessages(
  messages: ChatMessage[],
  items: QueuedUserMessage[]
): void {
  const content = formatQueuedAttachmentsForModel(items)
  if (!content) return
  messages.push({ role: 'user', content })
}

export {
  collapseQueuedTaskNotifications,
  formatQueueBatchUserText
} from './notifyCollapse.js'

export type {
  SlashHandleResult,
  SlashContext
} from './slash/index.js'
export {
  handleSlashCommand,
  BUILTIN_SLASH_COMMANDS,
  SLASH_PERMISSION_MODES
} from './slash/index.js'
