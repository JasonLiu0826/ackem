import type { ChatRow, ChatMessageRow } from '../store/appStore'

/** Stream events may only touch their reserved row, never a historical reply. */
export function updateAssistantRow(rows: ChatRow[], index: number | null, patch: Partial<Omit<ChatMessageRow, 'role' | 'kind'>>): ChatRow[] {
  if (index == null || index < 0 || index > rows.length) return rows
  const row = rows[index]
  if (row && (row.kind !== 'message' || row.role !== 'assistant')) return rows
  const next = [...rows]
  next[index] = { ...(row ?? { kind: 'message', role: 'assistant', content: '' }), ...patch }
  return next
}
