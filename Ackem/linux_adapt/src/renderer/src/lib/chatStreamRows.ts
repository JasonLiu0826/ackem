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
  let insertAt = n.length
  for (let i = n.length - 1; i >= 0; i--) {
    const r = n[i]
    if (r.kind === 'message' && r.role === 'assistant') {
      insertAt = i
      break
    }
  }
  const streamIdx = streamingAssistantIndexRef.current
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
  let insertAt = n.length
  for (let i = n.length - 1; i >= 0; i--) {
    const r = n[i]
    if (r.kind === 'message' && r.role === 'assistant') {
      insertAt = i
      break
    }
  }
  const streamIdx = streamingAssistantIndexRef.current
  if (streamIdx != null && insertAt <= streamIdx) {
    streamingAssistantIndexRef.current = streamIdx + 1
  }
  n.splice(insertAt, 0, row)
  return n
}

export function isVisibleSearchRow(row: ChatRow): boolean {
  return row.kind === 'search' && Boolean(row.cardBody?.trim() || row.error?.trim())
}
