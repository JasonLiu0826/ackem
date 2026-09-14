import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isPathInside } from '../memdir/paths.js'

export function fileHistoryEnabled(): boolean {
  if (
    process.env.ACKEM_DISABLE_FILE_CHECKPOINTING === '1' ||
    process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING === '1'
  ) {
    return false
  }
  return true
}

/** Default: only track files inside project cwd. Memdir excluded unless env. */
export function shouldTrackPath(absPath: string, cwd: string): boolean {
  const abs = path.resolve(absPath)
  const root = path.resolve(cwd)
  if (!isPathInside(abs, root)) return false
  if (process.env.ACKEM_FILE_HISTORY_INCLUDE_MEMDIR === '1') return true
  // Heuristic: skip common memdir roots under home
  const norm = abs.replace(/\\/g, '/').toLowerCase()
  if (norm.includes('/.ackemcode/memory/') || norm.includes('/memory/')) {
    return false
  }
  return true
}

export function getFileHistoryBackupRoot(sessionId: string): string {
  if (process.env.ACKEM_FILE_HISTORY_DIR?.trim()) {
    return path.join(
      path.resolve(process.env.ACKEM_FILE_HISTORY_DIR.trim()),
      sessionId
    )
  }
  return path.join(os.homedir(), '.ackemcode', 'file-history', sessionId)
}

/** Snapshot metadata — sibling of `{hash}@vN` backups under the same session dir. */
export function getFileHistoryStatePath(sessionId: string): string {
  return path.join(getFileHistoryBackupRoot(sessionId), 'state.json')
}

export function trackingKey(absPath: string): string {
  return path.resolve(absPath).replace(/\\/g, '/')
}

export function backupFileNameFor(absPath: string, version: number): string {
  const hash = createHash('sha256')
    .update(trackingKey(absPath))
    .digest('hex')
    .slice(0, 24)
  return `${hash}@v${version}`
}

export function resolveBackupPath(
  sessionId: string,
  backupFileName: string
): string {
  return path.join(getFileHistoryBackupRoot(sessionId), backupFileName)
}

export async function ensureBackupDir(sessionId: string): Promise<string> {
  const dir = getFileHistoryBackupRoot(sessionId)
  await fs.mkdir(dir, { recursive: true })
  return dir
}
