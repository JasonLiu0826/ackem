import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type StoredChatRow = {
  kind?: string
  role?: string
  content?: string
}

export type DiaryChatExchange = {
  user: string
  assistant?: string
}

const DEFAULT_MAX_PAIRS = 12
const DEFAULT_MAX_CHARS = 280

/** 璁板繂浜嬪疄 subject 鈫?鏃ヨ prompt 涓殑瑙掕壊鏍囩 */
export function formatDiaryFactLine(subject: string, summary: string): string {
  const s = subject.trim().toLowerCase()
  const who =
    s === 'user' || s === 'ta' || s === '涓讳汉'
      ? '鍏充簬ta'
      : s === 'companion' || s === 'self' || s === 'Ackem' || s === '鎴?
        ? '鍏充簬鎴?
        : subject.trim()
          ? `鍏充簬${subject.trim()}`
          : '鍏充簬ta'
  return `[${who}] ${summary.trim()}`
}

function normalizeChatMessage(row: StoredChatRow): { role: 'user' | 'assistant'; content: string } | null {
  if (row.kind && row.kind !== 'message') return null
  if (row.role !== 'user' && row.role !== 'assistant') return null
  if (typeof row.content !== 'string') return null
  const content = row.content.trim()
  if (!content) return null
  return { role: row.role, content }
}

/** 浠庝富鑱婂ぉ鍘嗗彶鎻愬彇甯﹁璇濅汉鏍囨敞鐨勫璇濇憳褰曪紙渚涙棩璁?prompt 浣跨敤锛?*/
export function loadDiaryChatExchanges(
  dataRoot: string,
  sessionId: string,
  options?: { maxPairs?: number; maxCharsPerMsg?: number }
): DiaryChatExchange[] {
  const maxPairs = options?.maxPairs ?? DEFAULT_MAX_PAIRS
  const maxChars = options?.maxCharsPerMsg ?? DEFAULT_MAX_CHARS

  const file = join(dataRoot, 'companion', `chat-history-${sessionId || 'default'}.json`)
  if (!existsSync(file)) return []

  let rows: StoredChatRow[]
  try {
    rows = JSON.parse(readFileSync(file, 'utf-8')) as StoredChatRow[]
    if (!Array.isArray(rows)) return []
  } catch {
    return []
  }

  const messages = rows
    .map(normalizeChatMessage)
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => m != null)

  const exchanges: DiaryChatExchange[] = []
  let pendingUser: string | null = null

  for (const msg of messages) {
    const clipped = msg.content.slice(0, maxChars)
    if (msg.role === 'user') {
      if (pendingUser != null) {
        exchanges.push({ user: pendingUser })
      }
      pendingUser = clipped
      continue
    }
    if (pendingUser != null) {
      exchanges.push({ user: pendingUser, assistant: clipped })
      pendingUser = null
    } else {
      exchanges.push({ user: '锛堟湰杞棤鐢ㄦ埛鍙戣█锛?, assistant: clipped })
    }
  }
  if (pendingUser != null) {
    exchanges.push({ user: pendingUser })
  }

  return exchanges.slice(-maxPairs)
}

export function formatDiaryChatExcerpts(exchanges: DiaryChatExchange[]): string[] {
  return exchanges.map((ex, i) => {
    const lines = [`绗?{i + 1}杞甡, `銆恡a銆?{ex.user}`]
    if (ex.assistant) lines.push(`銆愭垜銆?{ex.assistant}`)
    return lines.join('\n')
  })
}
