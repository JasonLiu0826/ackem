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

export function deleteChatHistoryFromDb(dataRoot: string, sessionId?: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  if (sessionId) {
    db.prepare(`DELETE FROM chat_history WHERE session_id = ?`).run(sessionId)
  } else {
    db.prepare(`DELETE FROM chat_history`).run()
  }
}
