import { getDatabase } from '../database'

export function kvGet(dataRoot: string, namespace: string, key: string): string | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db
    .prepare(`SELECT value FROM kv_store WHERE namespace = ? AND key = ?`)
    .get(namespace, key) as { value: string } | undefined
  return row?.value ?? null
}

export function kvSet(dataRoot: string, namespace: string, key: string, value: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const updatedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO kv_store(namespace, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(namespace, key, value, updatedAt)
}

export function kvDeleteNamespace(dataRoot: string, namespace: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM kv_store WHERE namespace = ?`).run(namespace)
}
