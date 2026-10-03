import type Database from 'better-sqlite3'

import { TombstoneIdConflictError } from '../ledger/errors.js'

import { clampQueryLimit } from '../ledger/queryLimit.js'



export type TombstoneScopeType = 'event' | 'fact' | 'episode' | 'topic'



export type MemoryTombstoneRow = {

  tombstone_id: string

  scope_type: TombstoneScopeType

  scope_id: string

  reason: string

  created_at: string

  control_event_id: string

}



export type DbTx = Database.Database



function isScopeUniqueConflict(message: string): boolean {
  return (
    /memory_tombstones\.scope_type/i.test(message) && /memory_tombstones\.scope_id/i.test(message)
  )
}

function isTombstoneIdPrimaryKeyConflict(message: string): boolean {
  return /memory_tombstones\.tombstone_id/i.test(message) && !isScopeUniqueConflict(message)
}



export class TombstoneRepository {

  private readonly insertTombstone

  private readonly listByScopeStmt



  constructor(private readonly db: Database.Database) {

    this.insertTombstone = db.prepare(`

      INSERT INTO memory_tombstones (

        tombstone_id, scope_type, scope_id, reason, created_at, control_event_id

      ) VALUES (

        @tombstone_id, @scope_type, @scope_id, @reason, @created_at, @control_event_id

      )

    `)

    this.listByScopeStmt = db.prepare(`

      SELECT * FROM memory_tombstones

      WHERE scope_type = ? AND scope_id = ?

      LIMIT ?

    `)

  }



  insert(tx: DbTx, row: MemoryTombstoneRow): 'inserted' | 'duplicate' {

    try {

      this.insertTombstone.run(row)

      return 'inserted'

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e)

      if (/UNIQUE constraint failed/i.test(msg)) {

        if (isScopeUniqueConflict(msg)) return 'duplicate'

        if (isTombstoneIdPrimaryKeyConflict(msg)) throw new TombstoneIdConflictError(row.tombstone_id)

      }

      throw e

    }

  }



  listByScope(scopeType: TombstoneScopeType, scopeId: string, limit: number): MemoryTombstoneRow[] {

    const lim = clampQueryLimit(limit)

    return this.listByScopeStmt.all(scopeType, scopeId, lim) as MemoryTombstoneRow[]

  }

}


