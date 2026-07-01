import { getDatabase } from '../database'

export function saveDiaryToDb(
  dataRoot: string,
  date: string,
  content: string,
  metaJson: string | null
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const updatedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO diary(date, content, meta_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       content = excluded.content,
       meta_json = excluded.meta_json,
       updated_at = excluded.updated_at`
  ).run(date, content, metaJson, updatedAt)
}

export function loadDiaryFromDb(dataRoot: string, date: string): string | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db.prepare(`SELECT content FROM diary WHERE date = ?`).get(date) as
    | { content: string }
    | undefined
  return row?.content ?? null
}

export function listDiaryDatesFromDb(dataRoot: string): string[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(`SELECT date FROM diary ORDER BY date DESC`)
    .all() as { date: string }[]
  return rows.map((r) => r.date)
}
