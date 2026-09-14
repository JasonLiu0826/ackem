/**
 * L3 — persist collapsed tool bodies for resume consistency (CC contextCollapseCommits spirit).
 */
import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { COLLAPSED_PREFIX } from './contextCollapseFull.js'

export type ContextCollapseCommit = {
  at: string
  toolCallId: string
  toolName: string
  label: string
  originalChars: number
  collapsedContent: string
}

export function mergeCollapseCommits(
  existing: ContextCollapseCommit[],
  incoming: ContextCollapseCommit[]
): ContextCollapseCommit[] {
  const byId = new Map(existing.map((c) => [c.toolCallId, c]))
  for (const c of incoming) byId.set(c.toolCallId, c)
  return [...byId.values()]
}

/** Re-apply stored collapsed text when history still has fat bodies (e.g. old saves). */
export function applyContextCollapseCommits(
  messages: ChatMessage[],
  commits: readonly ContextCollapseCommit[]
): ChatMessage[] {
  if (!commits.length) return messages
  const map = new Map(commits.map((c) => [c.toolCallId, c]))
  return messages.map((m) => {
    if (m.role !== 'tool' || !m.tool_call_id) return m
    const c = map.get(m.tool_call_id)
    if (!c) return m
    const text = flattenMessageContent(m.content)
    if (text.startsWith(COLLAPSED_PREFIX)) return m
    if (text.length <= c.originalChars * 0.5) return m
    return { ...m, content: c.collapsedContent }
  })
}
