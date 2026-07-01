import type { TurnTrace } from '../../engine/types'
import { getDatabase } from '../database'

export function appendTurnTraceToDb(dataRoot: string, trace: TurnTrace): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const ts = trace.timestamp ?? new Date().toISOString()
  const date = ts.slice(0, 10)
  const sessionId =
    (trace as TurnTrace & { sessionId?: string }).sessionId ?? 'default'
  const turnIndex = typeof trace.turn === 'number' ? trace.turn : 0
  db.prepare(
    `INSERT INTO turn_traces(date, session_id, turn_index, trace_json, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(date, sessionId, turnIndex, JSON.stringify(trace), ts)
}

export function loadTurnTracesFromDb(dataRoot: string, date: string): TurnTrace[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(
      `SELECT trace_json FROM turn_traces WHERE date = ? ORDER BY turn_index ASC, id ASC`
    )
    .all(date) as { trace_json: string }[]
  const out: TurnTrace[] = []
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.trace_json) as TurnTrace)
    } catch {
      /* skip */
    }
  }
  return out
}

export function countTracesInDb(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) AS c FROM turn_traces`).get() as { c: number }
  return row?.c ?? 0
}
