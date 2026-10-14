import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { getDatabase } from '../db/database'
import { canReadMemorySources } from './accessScope'

function hash(text: string): string { return createHash('sha256').update(text).digest('hex') }
function pathInRoot(root: string, rel: string): string | undefined {
  if (isAbsolute(rel)) return undefined
  try {
    const realRoot = realpathSync(root), path = realpathSync(join(root, rel)), local = relative(realRoot, path)
    return local && !local.startsWith('..') && !isAbsolute(local) ? path : undefined
  } catch { return undefined }
}
/** Trusted user promotion is an explicit personal-memory import, never inferred from a filename. */
export function approvePersonalMemoryDocument(dataRoot: string, rel: string): void {
  const db = getDatabase(dataRoot), path = pathInRoot(dataRoot, rel)
  if (!db || !path) throw Error('Memory document is outside the current profile')
  db.exec('CREATE TABLE IF NOT EXISTS memory_document_scope(rel_path TEXT PRIMARY KEY,content_hash TEXT NOT NULL,source_event_ids TEXT NOT NULL,scope_version INTEGER NOT NULL)')
  db.prepare('INSERT OR REPLACE INTO memory_document_scope VALUES(?,?,?,1)').run(rel.replace(/\\/g, '/'), hash(readFileSync(path, 'utf8')), '[]')
}
export function canReadIndexedMemoryDocument(dataRoot: string, rel: string, indexedHash?: string): boolean {
  const db = getDatabase(dataRoot)
  if (!db || !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_document_scope'").get()) return false
  const row = db.prepare('SELECT content_hash,source_event_ids,scope_version FROM memory_document_scope WHERE rel_path=?').get(rel.replace(/\\/g, '/')) as { content_hash: string; source_event_ids: string; scope_version: number } | undefined
  if (!row || row.scope_version !== 1 || !indexedHash || indexedHash !== row.content_hash) return false
  const path = pathInRoot(resolve(dataRoot), rel)
  try {
    if (!path || hash(readFileSync(path, 'utf8')) !== indexedHash) return false
    const sources: unknown = JSON.parse(row.source_event_ids)
    return Array.isArray(sources) && sources.every(v => typeof v === 'string') && canReadMemorySources(db, sources)
  } catch { return false }
}
