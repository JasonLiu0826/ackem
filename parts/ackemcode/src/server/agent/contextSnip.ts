/**
 * History snip — remove messages from session context (CC SnipTool spirit, Ackem-owned).
 */
import { nanoid } from 'nanoid'
import type { ChatMessage } from '../../shared/types.js'

export const SNIP_BOUNDARY_PREFIX = '[Context snipped —'

export type SnipRecord = {
  at: string
  removedIds: string[]
  summary: string
}

export function isSnipEnabled(): boolean {
  return process.env.ACKEM_DISABLE_SNIP !== '1'
}

export function ensureMessageIds(messages: ChatMessage[]): void {
  for (const m of messages) {
    if (!m.id) m.id = nanoid()
  }
}

function collectToolCallIds(m: ChatMessage): string[] {
  if (m.role !== 'assistant' || !m.tool_calls?.length) return []
  return m.tool_calls.map((c) => c.id)
}

/**
 * Expand removal set with tool results for removed assistant tool_calls.
 */
export function expandSnipRemovalSet(
  messages: ChatMessage[],
  seedIds: Set<string>
): Set<string> {
  const remove = new Set(seedIds)
  const removedToolCallIds = new Set<string>()
  for (const m of messages) {
    if (!m.id || !remove.has(m.id)) continue
    for (const tid of collectToolCallIds(m)) removedToolCallIds.add(tid)
  }
  for (const m of messages) {
    if (
      m.role === 'tool' &&
      m.tool_call_id &&
      removedToolCallIds.has(m.tool_call_id) &&
      m.id
    ) {
      remove.add(m.id)
    }
  }
  return remove
}

export function applySnipToMessages(
  messages: ChatMessage[],
  idsToRemove: Set<string>
): { messages: ChatMessage[]; removedCount: number; removedIds: string[] } {
  const expanded = expandSnipRemovalSet(messages, idsToRemove)
  const removedIds = [...expanded]
  const next = messages.filter((m) => !m.id || !expanded.has(m.id))
  return { messages: next, removedCount: removedIds.length, removedIds }
}

export function applyPersistedSnipRecords(
  history: ChatMessage[],
  records: SnipRecord[]
): ChatMessage[] {
  if (!records.length) return history
  const removed = new Set<string>()
  for (const r of records) {
    for (const id of r.removedIds) removed.add(id)
  }
  if (!removed.size) return history
  return history.filter((m) => !m.id || !removed.has(m.id))
}

export function buildSnipBoundaryMessage(
  removedCount: number,
  removedIds: string[]
): ChatMessage {
  return {
    role: 'user',
    id: nanoid(),
    content: `${SNIP_BOUNDARY_PREFIX} ${removedCount} message(s) removed from context. Re-read files if details are missing.]`,
    timestamp: new Date().toISOString(),
    snipMetadata: { removedIds }
  }
}
