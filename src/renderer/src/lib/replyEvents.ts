import type { ReplyEvent } from '../../../shared/response'
import type { ChatRow } from '../store/appStore'
import { updateAssistantRow } from './chatMessageUpdate'
export type ReplyCursor = { turnId: string; replyId?: string; sequence: number; terminal: boolean }
export function applyReplyEvent(rows: ChatRow[], index: number | null, cursor: ReplyCursor, event: ReplyEvent): { rows: ChatRow[]; cursor: ReplyCursor } {
  if (cursor.terminal || event.turnId !== cursor.turnId || event.sequence <= cursor.sequence || (cursor.replyId && cursor.replyId !== event.replyId) || index === null || rows[index]?.kind !== 'message') return { rows, cursor }
  const row = rows[index]
  if (row.kind !== 'message' || row.role !== 'assistant') return { rows, cursor }
  const nextCursor = { ...cursor, replyId: event.replyId, sequence: event.sequence, terminal: ['completed', 'failed', 'cancelled'].includes(event.type) }
  const common = { turnId: event.turnId, replyId: event.replyId, runId: event.runId, ...(event.origin ? { origin: event.origin } : {}), createdAt: row.createdAt ?? event.at }
  const patch = event.type === 'delta' ? { content: row.content + event.text }
    : event.type === 'replace' ? { content: event.text }
    : event.type === 'completed' ? { content: event.text, generationState: event.generationState }
    : event.type === 'reasoning' ? { reasoning: (row.reasoning ?? '') + event.text, reasoningStartedAt: row.reasoningStartedAt ?? event.at }
    : event.type === 'status' ? { activities: [...(row.activities ?? []), { text: event.text, at: event.at, source: 'route' as const }].slice(-40) }
    : event.type === 'failed' ? { content: row.content || event.text, generationState: 'error' as const }
    : event.type === 'cancelled' ? { generationState: 'stopped' as const } : {}
  return { rows: updateAssistantRow(rows, index, { ...common, ...patch }), cursor: nextCursor }
}
