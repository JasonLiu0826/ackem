import type { SearchCardPayload } from '../../../shared/searchCard'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'
import type { ChatRow } from '../store/appStore'

export function insertMemoryAuditCardIntoRows(
  prev: ChatRow[],
  payload: MemoryAuditCardPayload,
  streamingAssistantIndexRef: { current: number | null }
): ChatRow[] {
  const n = [...prev]
  const row: ChatRow = { kind: 'memoryAudit', ...payload }
  const streamIdx = streamingAssistantIndexRef.current
  const target = streamIdx != null ? n[streamIdx] : undefined
  const insertAt = target?.kind === 'message' && target.role === 'assistant' ? streamIdx! : n.length
  if (streamIdx != null && insertAt <= streamIdx) {
    streamingAssistantIndexRef.current = streamIdx + 1
  }
  n.splice(insertAt, 0, row)
  return n
}

export function insertSearchCardIntoRows(
  prev: ChatRow[],
  payload: SearchCardPayload,
  streamingAssistantIndexRef: { current: number | null }
): ChatRow[] {
  const n = [...prev]
  const row: ChatRow = { kind: 'search', ...payload }
  const streamIdx = streamingAssistantIndexRef.current
  const target = streamIdx != null ? n[streamIdx] : undefined
  const insertAt = target?.kind === 'message' && target.role === 'assistant' ? streamIdx! : n.length
  if (streamIdx != null && insertAt <= streamIdx) {
    streamingAssistantIndexRef.current = streamIdx + 1
  }
  n.splice(insertAt, 0, row)
  return n
}

export function isVisibleSearchRow(row: ChatRow): boolean {
  return row.kind === 'search' && Boolean(row.cardBody?.trim() || row.error?.trim())
}
