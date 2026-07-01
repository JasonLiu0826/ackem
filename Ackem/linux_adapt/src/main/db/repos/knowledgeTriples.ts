import type { Triple } from '../../engine/types'
import { getDatabase, withTransaction } from '../database'

function rowToTriple(row: Record<string, unknown>): Triple {
  return {
    id: String(row.id),
    subject: String(row.subject),
    predicate: String(row.predicate),
    object: String(row.object),
    confidence: Number(row.confidence),
    sourceFactIds: JSON.parse(String(row.source_fact_ids)) as string[],
    createdAt: String(row.created_at)
  }
}

export function countTriplesInDb(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) AS c FROM knowledge_triples`).get() as { c: number }
  return row?.c ?? 0
}

export function loadTriplesFromDb(dataRoot: string): Triple[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare(`SELECT * FROM knowledge_triples ORDER BY created_at ASC`).all() as Record<
    string,
    unknown
  >[]
  return rows.map(rowToTriple)
}

export function replaceTriplesInDb(dataRoot: string, triples: Triple[]): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  withTransaction(dataRoot, (d) => {
    d.prepare(`DELETE FROM knowledge_triples`).run()
    const ins = d.prepare(
      `INSERT INTO knowledge_triples(
        id, subject, predicate, object, confidence, source_fact_ids, created_at
      ) VALUES (
        @id, @subject, @predicate, @object, @confidence, @source_fact_ids, @created_at
      )`
    )
    for (const t of triples) {
      ins.run({
        id: t.id,
        subject: t.subject,
        predicate: t.predicate,
        object: t.object,
        confidence: t.confidence,
        source_fact_ids: JSON.stringify(t.sourceFactIds),
        created_at: t.createdAt
      })
    }
  })
}

/** Phase 3: 单条 INSERT（新增三元组） */
export function insertTriple(dataRoot: string, triple: Triple): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO knowledge_triples(
      id, subject, predicate, object, confidence, source_fact_ids, created_at
    ) VALUES (
      @id, @subject, @predicate, @object, @confidence, @source_fact_ids, @created_at
    )`
  ).run({
    id: triple.id,
    subject: triple.subject,
    predicate: triple.predicate,
    object: triple.object,
    confidence: triple.confidence,
    source_fact_ids: JSON.stringify(triple.sourceFactIds),
    created_at: triple.createdAt
  })
}

/** Phase 3: 清空所有三元组 */
export function deleteAllTriplesFromDb(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM knowledge_triples`).run()
}
