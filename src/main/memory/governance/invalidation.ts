import type Database from 'better-sqlite3'
import { deleteFactEmbeddingsAllModels } from '../../db/repos/factEmbeddingsRepo.js'
import { updateFactInDb } from '../../db/repos/memoryFacts.js'
import type { MemoryFact } from '../semantic/types.js'

export type InvalidationCounts = {
  embeddings: number
  associations: number
}

export function dropFactDerivedIndexes(db: Database.Database, factId: string): InvalidationCounts {
  const embBefore = (
    db.prepare(`SELECT COUNT(*) AS c FROM fact_embeddings WHERE fact_id = ?`).get(factId) as { c: number }
  ).c
  deleteFactEmbeddingsAllModels(db, [factId])

  const assocDel = db
    .prepare(`DELETE FROM memory_associations WHERE fact_id_a = ? OR fact_id_b = ?`)
    .run(factId, factId)
  return {
    embeddings: embBefore,
    associations: assocDel.changes ?? 0
  }
}

export function retireFactRecord(dataRoot: string, fact: MemoryFact, at: string): void {
  updateFactInDb(dataRoot, {
    ...fact,
    status: 'retired',
    updatedAt: at
  })
}
