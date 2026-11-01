/**
 * Safe split for full compact — avoid orphan tool_results / straddled tool_calls.
 * Claude Code compact grouping spirit (Ackem-owned, no Anthropic paste).
 */
import type { ChatMessage } from '../../../shared/types.js'

/**
 * Split non-system messages into head (summarize) + tail (keep verbatim).
 * Guarantees:
 * - tail does not start with a bare `tool` message
 * - an assistant with tool_calls is not left in head while its results are in tail
 */
export function splitForFullCompact(
  rest: ChatMessage[],
  keepRecent: number
): { head: ChatMessage[]; tail: ChatMessage[] } {
  if (rest.length === 0) return { head: [], tail: [] }
  if (rest.length <= keepRecent + 2) {
    return { head: [], tail: rest }
  }

  let cut = Math.max(0, rest.length - Math.max(1, keepRecent))

  // Prefer cutting on a user turn (clean semantic boundary)
  const preferred = cut
  while (cut > 0 && rest[cut]!.role !== 'user') {
    cut--
  }
  // If we walked to 0 without finding user, revert and fix orphans mechanically
  if (cut === 0 && rest[0]!.role !== 'user') {
    cut = preferred
  }

  // Never leave assistant+tool_calls in head with results in tail
  if (cut > 0) {
    const prev = rest[cut - 1]!
    if (prev.role === 'assistant' && (prev.tool_calls?.length ?? 0) > 0) {
      cut -= 1
    }
  }

  // Never start tail on orphan tool results
  while (cut < rest.length && rest[cut]!.role === 'tool') {
    cut++
  }

  let head = rest.slice(0, cut)
  let tail = rest.slice(cut)

  // Nothing meaningful to summarize
  if (head.length < 2) {
    return { head: [], tail: rest }
  }

  // Drop leading orphan tools from head (shouldn't happen, belt-and-suspenders)
  while (head.length && head[0]!.role === 'tool') {
    head = head.slice(1)
  }
  if (head.length < 2) {
    return { head: [], tail: rest }
  }

  return { head, tail }
}

/** True when transcript still has a valid assistant→tool pairing (no orphans). */
export function toolPairsIntact(messages: ChatMessage[]): boolean {
  const pending = new Set<string>()
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      for (const c of m.tool_calls) pending.add(c.id)
    } else if (m.role === 'tool' && m.tool_call_id) {
      if (!pending.has(m.tool_call_id)) return false
      pending.delete(m.tool_call_id)
    }
  }
  return pending.size === 0
}
