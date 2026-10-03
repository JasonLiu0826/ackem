/**
 * Windows WAL safe cleanup for legacy memory tests: pooled/unpooled SQLite
 * handles can outlive close briefly; retry EBUSY/EPERM with backoff before
 * giving up (tmpdir residue is harmless). Shared by the memory root tests
 * that predate the ledger suite.
 */
import { rmSync } from 'node:fs'
import { closeAllDatabases } from '../db/database.js'

export function safeRmDir(dir: string): void {
  try {
    closeAllDatabases()
  } catch {
    /* best-effort */
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EBUSY' && code !== 'EPERM') return
      const until = Date.now() + 50 * (attempt + 1)
      while (Date.now() < until) {
        /* brief spin: handles release on close in ms */
      }
    }
  }
  /* final failure leaves tmpdir residue — harmless */
}
