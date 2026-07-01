import { getDatabase } from '../database'
export type HabitLine = { ts: string; text: string }

export function appendHabitToDb(dataRoot: string, text: string, ts: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`INSERT INTO procedural_habits(ts, text) VALUES (?, ?)`).run(ts, text)
}

export function loadHabitsFromDb(dataRoot: string): HabitLine[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(`SELECT ts, text FROM procedural_habits ORDER BY id ASC`)
    .all() as Array<{ ts: string; text: string }>
  return rows.map((r) => ({ ts: r.ts, text: r.text }))
}

export function replaceHabitsInDb(dataRoot: string, lines: HabitLine[]): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const del = db.prepare(`DELETE FROM procedural_habits`)
  const ins = db.prepare(`INSERT INTO procedural_habits(ts, text) VALUES (?, ?)`)
  const tx = db.transaction(() => {
    del.run()
    for (const line of lines) ins.run(line.ts, line.text)
  })
  tx()
}
