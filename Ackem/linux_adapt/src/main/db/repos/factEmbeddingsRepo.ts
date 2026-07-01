import type Database from 'better-sqlite3'
import type { MemoryFact } from '../../engine/types'

const KV_NAMESPACE = 'fact_embeddings'

/** 事实库指纹：任一 fact 增删改即变化 */
export function computeCorpusHash(facts: MemoryFact[]): string {
  const active = facts.filter((f) => f.status === 'active')
  if (active.length === 0) return 'empty'
  const parts = active
    .map((f) => `${f.id}:${f.updatedAt}`)
    .sort()
    .join('|')
  let h = 0
  for (let i = 0; i < parts.length; i++) {
    h = (Math.imul(31, h) + parts.charCodeAt(i)) | 0
  }
  return `${active.length}-${h}`
}

function vectorToBlob(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4)
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4)
  return buf
}

function blobToVector(blob: Buffer, dim: number): number[] {
  const out: number[] = new Array(dim)
  for (let i = 0; i < dim; i++) out[i] = blob.readFloatLE(i * 4)
  return out
}

export function getStoredCorpusHash(db: Database.Database, modelSig: string): string | null {
  const row = db
    .prepare(`SELECT value FROM kv_store WHERE namespace = ? AND key = ?`)
    .get(KV_NAMESPACE, modelSig) as { value: string } | undefined
  return row?.value ?? null
}

export function setStoredCorpusHash(db: Database.Database, modelSig: string, hash: string): void {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO kv_store(namespace, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(KV_NAMESPACE, modelSig, hash, updatedAt)
}

export function loadFactEmbeddings(
  db: Database.Database,
  modelSig: string
): Map<string, number[]> {
  const rows = db
    .prepare(
      `SELECT fact_id, dim, vector FROM fact_embeddings WHERE model_sig = ?`
    )
    .all(modelSig) as Array<{ fact_id: string; dim: number; vector: Buffer }>
  const map = new Map<string, number[]>()
  for (const row of rows) {
    map.set(row.fact_id, blobToVector(row.vector, row.dim))
  }
  return map
}

export function upsertFactEmbeddings(
  db: Database.Database,
  modelSig: string,
  entries: Array<{ factId: string; updatedAt: string; vector: number[] }>
): void {
  const stmt = db.prepare(
    `INSERT INTO fact_embeddings(fact_id, model_sig, dim, updated_at, vector)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(fact_id, model_sig) DO UPDATE SET
       dim = excluded.dim,
       updated_at = excluded.updated_at,
       vector = excluded.vector`
  )
  const tx = db.transaction((items: typeof entries) => {
    for (const e of items) {
      stmt.run(e.factId, modelSig, e.vector.length, e.updatedAt, vectorToBlob(e.vector))
    }
  })
  tx(entries)
}

export function deleteStaleFactEmbeddings(
  db: Database.Database,
  modelSig: string,
  activeFactIds: Set<string>
): void {
  const rows = db
    .prepare(`SELECT fact_id FROM fact_embeddings WHERE model_sig = ?`)
    .all(modelSig) as Array<{ fact_id: string }>
  const del = db.prepare(
    `DELETE FROM fact_embeddings WHERE fact_id = ? AND model_sig = ?`
  )
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) del.run(id, modelSig)
  })
  const stale = rows.map((r) => r.fact_id).filter((id) => !activeFactIds.has(id))
  if (stale.length > 0) tx(stale)
}

export function deleteFactEmbeddingsForModel(db: Database.Database, modelSig: string): void {
  db.prepare(`DELETE FROM fact_embeddings WHERE model_sig = ?`).run(modelSig)
  db.prepare(`DELETE FROM kv_store WHERE namespace = ? AND key = ?`).run(KV_NAMESPACE, modelSig)
}
