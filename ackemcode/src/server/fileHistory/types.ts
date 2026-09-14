/**
 * File history types — Claude Code utils/fileHistory.ts spirit.
 */

/** null = file did not exist at this version (rewind deletes it). */
export type BackupFileName = string | null

export type FileHistoryBackup = {
  backupFileName: BackupFileName
  version: number
  backupTime: string // ISO
}

export type FileHistorySnapshot = {
  /** User-turn checkpoint id (Ackem: nanoid at turn start). */
  messageId: string
  trackedFileBackups: Record<string, FileHistoryBackup>
  timestamp: string // ISO
}

export type FileHistoryState = {
  snapshots: FileHistorySnapshot[]
  trackedFiles: Set<string>
  snapshotSequence: number
}

/** Disk JSON next to backups (CC transcript `file-history-snapshot` spirit). */
export const FILE_HISTORY_STATE_VERSION = 1

export type FileHistoryStateJson = {
  version: number
  sessionId: string
  snapshotSequence: number
  trackedFiles: string[]
  snapshots: FileHistorySnapshot[]
}

export const MAX_SNAPSHOTS = 100

export type RewindResult = {
  ok: boolean
  messageId: string
  filesChanged: string[]
  dryRun: boolean
  error?: string
}
