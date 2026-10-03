import { getDatabase } from '../../db/database.js'

/** Durable plugin identity for a follow-up control after the process restarts. */
export function lastPluginAction(dataRoot: string, sessionId: string): { extensionId: string; at: number } | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db.prepare(`
    SELECT target_id, updated_at FROM memory_action_runs
    WHERE session_id = ? AND nature = 'plugin' AND target_id IS NOT NULL
      AND status IN ('running', 'waiting_permission', 'succeeded')
    ORDER BY updated_at DESC, rowid DESC LIMIT 1
  `).get(sessionId) as { target_id: string; updated_at: string } | undefined
  if (!row) return null
  return { extensionId: row.target_id, at: Date.parse(row.updated_at) || 0 }
}
