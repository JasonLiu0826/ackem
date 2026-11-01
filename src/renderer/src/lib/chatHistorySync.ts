/**
 * 三端统一会话：把主进程推来的「渠道新消息」并进当前对话框。
 *
 * 规则：
 * - 已经有同一行（同角色 + 同 at + 同内容）就不再追加，避免重载后被推重；
 * - 空内容的 assistant 占位不展示（那是别的窗口正在流式生成的气泡）；
 * - 若本地最后一行是正在流式生成的空气泡，把新消息插在它前面，
 *   这样 QQ / 微信的新消息不会跑到「她还没说完的那句话」下面。
 */
import type { ChatRow } from '../store/appStore'

function rowKey(row: ChatRow): string | null {
  if (row.kind !== 'message') return null
  return `${row.role}|${row.at ?? ''}|${row.content}`
}

/**
 * 首次加载历史时，界面可能已经通过 `chat:history-appended` 收到了一条新消息。
 * 直接 setRows(loaded) 会把它冲掉，所以这里把「读到的历史」和「已在界面上的行」合并。
 */
export function mergeLoadedChatRows(loaded: ChatRow[], current: ChatRow[]): ChatRow[] {
  if (current.length === 0) return loaded
  const seen = new Set<string>()
  for (const row of loaded) {
    const key = rowKey(row)
    if (key) seen.add(key)
  }
  const extra = current.filter((row) => {
    const key = rowKey(row)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (extra.length === 0) return loaded
  // extra 是「加载期间新到的消息」，一定比读到的历史更新，直接接在后面
  return [...loaded, ...extra]
}

export function appendIncomingChatRows(prev: ChatRow[], incoming: ChatRow[]): ChatRow[] {
  if (incoming.length === 0) return prev

  const seen = new Set<string>()
  for (const row of prev) {
    const key = rowKey(row)
    if (key) seen.add(key)
  }

  const fresh: ChatRow[] = []
  for (const row of incoming) {
    const key = rowKey(row)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    if (row.kind === 'message' && row.role === 'assistant' && !row.content.trim()) continue
    fresh.push(row)
  }
  if (fresh.length === 0) return prev

  const next = [...prev]
  const last = next[next.length - 1]
  if (last?.kind === 'message' && last.role === 'assistant' && !last.content.trim()) {
    next.splice(next.length - 1, 0, ...fresh)
    return next
  }
  return [...next, ...fresh]
}
