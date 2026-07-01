import type { FullState } from '../../engine/types'
import { getDatabase, withTransaction } from '../database'

export function loadCompanionStateFromDb(
  dataRoot: string,
  sessionId: string
): FullState | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db
    .prepare(`SELECT state_json, emergence_json FROM companion_state WHERE session_id = ?`)
    .get(sessionId) as { state_json: string; emergence_json?: string } | undefined
  if (!row) return null
  try {
    const raw = JSON.parse(row.state_json) as FullState
    if (!raw.relationship || !raw.emotion) return null
    if (row.emergence_json) {
      try {
        raw.emergencePersistence = JSON.parse(row.emergence_json)
      } catch { /* emergence_json 解析失败不影响主状态 */ }
    }
    return raw
  } catch {
    return null
  }
}

export function saveCompanionStateToDb(
  dataRoot: string,
  sessionId: string,
  state: FullState
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const updatedAt = new Date().toISOString()
  const emergenceJson = state.emergencePersistence
    ? JSON.stringify(state.emergencePersistence)
    : null
  db.prepare(
    `INSERT INTO companion_state(session_id, version, state_json, emergence_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       version = excluded.version,
       state_json = excluded.state_json,
       emergence_json = excluded.emergence_json,
       updated_at = excluded.updated_at`
  ).run(sessionId, state.version, JSON.stringify(state), emergenceJson, updatedAt)
}

export function deleteCompanionStateFromDb(dataRoot: string, sessionId?: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  if (sessionId) {
    db.prepare(`DELETE FROM companion_state WHERE session_id = ?`).run(sessionId)
  } else {
    db.prepare(`DELETE FROM companion_state`).run()
  }
}
