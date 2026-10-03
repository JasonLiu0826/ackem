import type { MemoryFact } from './types.js'
import {
  countFactsInDb,
  loadFactsFromDb,
  loadFactsByOwner,
  insertFact as dbInsertFact,
  updateFactInDb,
  deleteFactFromDb,
  replaceFactsInDb,
  deleteFactsByOwner,
  deleteImportSeedsByOwner
} from '../../db/repos/memoryFacts.js'

/** CRUD-only fact persistence (no dedupe, no embeddings). */
export class FactRepository {
  constructor(readonly dataRoot: string) {}

  count(): number {
    return countFactsInDb(this.dataRoot)
  }

  loadAll(): MemoryFact[] {
    return loadFactsFromDb(this.dataRoot)
  }

  loadByOwner(ownerAgentId: string): MemoryFact[] {
    return loadFactsByOwner(this.dataRoot, ownerAgentId)
  }

  insert(fact: MemoryFact): void {
    dbInsertFact(this.dataRoot, fact)
  }

  update(fact: MemoryFact): void {
    updateFactInDb(this.dataRoot, fact)
  }

  delete(id: string): void {
    deleteFactFromDb(this.dataRoot, id)
  }

  replaceAll(facts: MemoryFact[]): void {
    replaceFactsInDb(this.dataRoot, facts)
  }

  deleteByOwner(ownerAgentId: string): void {
    deleteFactsByOwner(this.dataRoot, ownerAgentId)
  }

  deleteImportSeedsByOwner(ownerAgentId: string): void {
    deleteImportSeedsByOwner(this.dataRoot, ownerAgentId)
  }
}
