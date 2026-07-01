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

/** 记忆事实 subject → 日记 prompt 中的角色标签 */
export function formatDiaryFactLine(subject: string, summary: string): string {
  const s = subject.trim().toLowerCase()
  const who =
    s === 'user' || s === 'ta' || s === '主人'
      ? '关于ta'
      : s === 'companion' || s === 'self' || s === 'ackem' || s === '我'
        ? '关于我'
        : subject.trim()
          ? `关于${subject.trim()}`
          : '关于ta'
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

/** 从主聊天历史提取带说话人标注的对话摘录（供日记 prompt 使用） */
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
      exchanges.push({ user: '（本轮无用户发言）', assistant: clipped })
    }
  }
  if (pendingUser != null) {
    exchanges.push({ user: pendingUser })
  }

  return exchanges.slice(-maxPairs)
}

export function formatDiaryChatExcerpts(exchanges: DiaryChatExchange[]): string[] {
  return exchanges.map((ex, i) => {
    const lines = [`第${i + 1}轮`, `【ta】${ex.user}`]
    if (ex.assistant) lines.push(`【我】${ex.assistant}`)
    return lines.join('\n')
  })
}
