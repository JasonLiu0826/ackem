import { getDatabase } from '../database'

export function loadChatHistoryFromDb(dataRoot: string, sessionId: string): unknown[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const row = db
    .prepare(`SELECT rows_json FROM chat_history WHERE session_id = ?`)
    .get(sessionId) as { rows_json: string } | undefined
  if (!row) return []
  try {
    const parsed = JSON.parse(row.rows_json) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveChatHistoryToDb(dataRoot: string, sessionId: string, rows: unknown[]): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const trimmed = rows.slice(-2000)
  const updatedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO chat_history(session_id, rows_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       rows_json = excluded.rows_json,
       updated_at = excluded.updated_at`
  ).run(sessionId, JSON.stringify(trimmed), updatedAt)
}

/** 列出所有存在聊天记录的会话 id（跨端迁移用） */
export function listChatHistorySessionIds(dataRoot: string): string[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare(`SELECT session_id FROM chat_history`).all() as Array<{
    session_id: string
  }>
  return rows.map((r) => r.session_id).filter((id): id is string => Boolean(id))
}

/** 会话最后一次写入时间；没有记录时返回 null */
export function getChatHistoryUpdatedAt(dataRoot: string, sessionId: string): string | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db
    .prepare(`SELECT updated_at FROM chat_history WHERE session_id = ?`)
    .get(sessionId) as { updated_at: string } | undefined
  return row?.updated_at ?? null
}

export function deleteChatHistoryFromDb(dataRoot: string, sessionId?: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  if (sessionId) {
    db.prepare(`DELETE FROM chat_history WHERE session_id = ?`).run(sessionId)
  } else {
    db.prepare(`DELETE FROM chat_history`).run()
  }
}
