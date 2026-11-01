/**
 * G-06 — retry last completed turn (workbench only; CLI has no entry).
 */
import type { ChatMessage } from '../../shared/types.js'
import { flattenMessageContent } from '../../shared/messageContent.js'

export function isInjectedUserMessage(
  content: ChatMessage['content'] | undefined
): boolean {
  const c = flattenMessageContent(content ?? null).trim()
  if (!c) return true
  if (c.startsWith('[Context compacted]')) return true
  if (c.startsWith('[Context snipped')) return true
  if (c.startsWith('[SubagentStart hook')) return true
  if (c.includes('<attachment kind="queue"')) return true
  if (
    c.includes('<system-reminder>') &&
    c.includes('<attachment kind=')
  ) {
    return true
  }
  return false
}

/** Index of the last real user prompt (not attachment / compact inject). */
export function findLastTurnUserIndex(history: ChatMessage[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!
    if (m.role !== 'user') continue
    const c = m.content
    if (isInjectedUserMessage(c)) continue
    return i
  }
  return -1
}

export type RetryLastTurnPrep =
  | { ok: true; userIndex: number; history: ChatMessage[] }
  | { ok: false; error: string; code: string }

export function prepareRetryLastTurnHistory(
  history: ChatMessage[]
): RetryLastTurnPrep {
  const userIndex = findLastTurnUserIndex(history)
  if (userIndex < 0) {
    return { ok: false, error: 'No user turn to retry', code: 'no_turn' }
  }
  for (let i = userIndex + 1; i < history.length; i++) {
    const m = history[i]
    if (m?.role !== 'user') continue
    if (isInjectedUserMessage(m.content)) continue
    return {
      ok: false,
      error: 'Only the most recent turn can be retried',
      code: 'not_last_turn'
    }
  }
  return { ok: true, userIndex, history: history.slice(0, userIndex) }
}
