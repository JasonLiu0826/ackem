/**
 * D-05 — rebuild Ink history from persisted ChatMessage[] on attach/resume.
 */
import type { ChatMessage } from '../../shared/types.js'
import type { HistoryItem } from './historyTypes.js'

function isInjectedUser(content: string): boolean {
  return (
    content.includes('<attachment kind=') ||
    content.includes('<system-reminder>') ||
    content.startsWith('[Context compacted]')
  )
}

/** Strip runtime attachment blocks; keep the human-facing prompt line. */
export function userDisplayText(content: string): string {
  const cut = content.search(/<(?:attachment|system-reminder)\b/i)
  const head = (cut >= 0 ? content.slice(0, cut) : content).trim()
  return head || content.trim().slice(0, 120)
}

export function chatHistoryToCliItems(history: ChatMessage[]): HistoryItem[] {
  const items: HistoryItem[] = []
  for (const m of history) {
    if (m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
      if (isInjectedUser(m.content)) continue
      const text = userDisplayText(m.content)
      if (!text) continue
      items.push({ kind: 'you', text })
    }
    if (
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      m.content.trim() &&
      !(m.tool_calls && m.tool_calls.length > 0)
    ) {
      items.push({ kind: 'assistant', text: m.content })
    }
  }
  return items
}
