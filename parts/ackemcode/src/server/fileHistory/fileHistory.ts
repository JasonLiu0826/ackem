/**
 * Session file checkpointing — Claude Code fileHistoryMakeSnapshot /
 * fileHistoryTrackEdit / fileHistoryRewind spirit.
 *
 * Persistence (CC recordFileHistorySnapshot / resume restore):
 * - Backup blobs: ~/.ackemcode/file-history/{sessionId}/{hash}@vN
 * - Metadata:     ~/.ackemcode/file-history/{sessionId}/state.json
 * Resume: FileHistory.open(sessionId) reloads state so rewind works after restart.
 *
 * Lifecycle:
 * 1) makeSnapshot(messageId) at each user turn start
 * 2) trackEdit(absPath) BEFORE write/edit on disk
 * 3) rewind(messageId) restores backups from that snapshot
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  backupFileNameFor,
  ensureBackupDir,
  fileHistoryEnabled,
  getFileHistoryBackupRoot,
  getFileHistoryStatePath,
  resolveBackupPath,
  shouldTrackPath,
  trackingKey
} from './paths.js'
import {
  FILE_HISTORY_STATE_VERSION,
  MAX_SNAPSHOTS,
  type FileHistoryBackup,
  type FileHistorySnapshot,
  type FileHistoryState,
  type FileHistoryStateJson,
  type RewindResult
} from './types.js'

export function createFileHistoryState(): FileHistoryState {
  return {
    snapshots: [],
    trackedFiles: new Set(),
    snapshotSequence: 0
  }
}

export function serializeFileHistoryState(
  sessionId: string,
  state: FileHistoryState
): FileHistoryStateJson {
  return {
    version: FILE_HISTORY_STATE_VERSION,
    sessionId,
    snapshotSequence: state.snapshotSequence,
    trackedFiles: [...state.trackedFiles],
    snapshots: state.snapshots.map((s) => ({
      messageId: s.messageId,
      timestamp: s.timestamp,
      trackedFileBackups: { ...s.trackedFileBackups }
    }))
  }
}

export function parseFileHistoryState(raw: unknown): FileHistoryState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<FileHistoryStateJson>
  if (o.version !== FILE_HISTORY_STATE_VERSION) return null
  if (!Array.isArray(o.snapshots) || !Array.isArray(o.trackedFiles)) return null
  const snapshots: FileHistorySnapshot[] = []
  for (const s of o.snapshots) {
    if (!s || typeof s !== 'object') continue
    if (typeof s.messageId !== 'string' || typeof s.timestamp !== 'string') continue
    if (!s.trackedFileBackups || typeof s.trackedFileBackups !== 'object') continue
    snapshots.push({
      messageId: s.messageId,
      timestamp: s.timestamp,
      trackedFileBackups: { ...s.trackedFileBackups }
    })
  }
  return {
    snapshots,
    trackedFiles: new Set(
      o.trackedFiles.filter((k): k is string => typeof k === 'string' && k.length > 0)
    ),
    snapshotSequence:
      typeof o.snapshotSequence === 'number' && Number.isFinite(o.snapshotSequence)
        ? o.snapshotSequence
        : snapshots.length
  }
}

export async function loadFileHistoryState(
  sessionId: string
): Promise<FileHistoryState | null> {
  const file = getFileHistoryStatePath(sessionId)
  try {
    const text = await fs.readFile(file, 'utf8')
    return parseFileHistoryState(JSON.parse(text) as unknown)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    console.error('fileHistory load failed', sessionId, e)
    return null
  }
}

export async function saveFileHistoryState(
  sessionId: string,
  state: FileHistoryState
): Promise<void> {
  if (!fileHistoryEnabled()) return
  await ensureBackupDir(sessionId)
  const file = getFileHistoryStatePath(sessionId)
  const tmp = `${file}.${process.pid}.tmp`
  const json = JSON.stringify(serializeFileHistoryState(sessionId, state), null, 2)
  await fs.writeFile(tmp, json, 'utf8')
  await fs.rename(tmp, file)
}

/** Drop metadata (+ best-effort backup dir) — CC /clear empty fileHistory spirit. */
export async function clearFileHistoryPersistence(sessionId: string): Promise<void> {
  const root = getFileHistoryBackupRoot(sessionId)
  try {
    await fs.rm(root, { recursive: true, force: true })
  } catch (e) {
    console.error('fileHistory clear failed', sessionId, e)
  }
}

async function createBackup(
  sessionId: string,
  filePath: string,
  version: number
): Promise<FileHistoryBackup> {
  const backupTime = new Date().toISOString()
  let srcStat: Awaited<ReturnType<typeof fs.stat>>
  try {
    srcStat = await fs.stat(filePath)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { backupFileName: null, version, backupTime }
    }
    throw e
  }
  if (srcStat.isDirectory()) {
    return { backupFileName: null, version, backupTime }
  }

  const name = backupFileNameFor(filePath, version)
  const dest = resolveBackupPath(sessionId, name)
  await ensureBackupDir(sessionId)
  try {
    await fs.copyFile(filePath, dest)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(filePath, dest)
    } else {
      throw e
    }
  }
  try {
    await fs.chmod(dest, srcStat.mode)
  } catch {
    /* ignore chmod on Windows */
  }
  return { backupFileName: name, version, backupTime }
}

async function filesDiffer(
  originalFile: string,
  sessionId: string,
  backupFileName: string
): Promise<boolean> {
  const backupPath = resolveBackupPath(sessionId, backupFileName)
  try {
    const [a, b] = await Promise.all([
      fs.readFile(originalFile, 'utf8'),
      fs.readFile(backupPath, 'utf8')
    ])
    return a !== b
  } catch {
    return true
  }
}

async function restoreBackup(
  filePath: string,
  sessionId: string,
  backupFileName: string
): Promise<void> {
  const backupPath = resolveBackupPath(sessionId, backupFileName)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.copyFile(backupPath, filePath)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(path.dirname(backupPath), { recursive: true })
      throw e
    }
    throw e
  }
}

export class FileHistory {
  readonly state: FileHistoryState
  readonly sessionId: string
  private persistChain: Promise<void> = Promise.resolve()

  constructor(sessionId: string, state?: FileHistoryState) {
    this.sessionId = sessionId
    this.state = state ?? createFileHistoryState()
  }

  /** Resume after process restart — load state.json next to backups. */
  static async open(sessionId: string): Promise<FileHistory> {
    const loaded = await loadFileHistoryState(sessionId)
    return new FileHistory(sessionId, loaded ?? undefined)
  }

  /** Await pending disk writes (tests / graceful shutdown). */
  async flush(): Promise<void> {
    await this.persistChain
  }

  private queuePersist(): void {
    if (!fileHistoryEnabled()) return
    this.persistChain = this.persistChain
      .then(() => saveFileHistoryState(this.sessionId, this.state))
      .catch((e) => {
        console.error('fileHistory persist failed', this.sessionId, e)
      })
  }

  listSnapshots(): Array<{ messageId: string; timestamp: string; fileCount: number }> {
    return this.state.snapshots.map((s) => ({
      messageId: s.messageId,
      timestamp: s.timestamp,
      fileCount: Object.keys(s.trackedFileBackups).length
    }))
  }

  canRestore(messageId: string): boolean {
    return this.state.snapshots.some((s) => s.messageId === messageId)
  }

  latestMessageId(): string | undefined {
    return this.state.snapshots.at(-1)?.messageId
  }

  /**
   * Open a checkpoint for the current user turn (call once at turn start).
   */
  async makeSnapshot(messageId: string): Promise<void> {
    if (!fileHistoryEnabled()) return

    const trackedFileBackups: Record<string, FileHistoryBackup> = {}
    const mostRecent = this.state.snapshots.at(-1)

    if (mostRecent) {
      await Promise.all(
        [...this.state.trackedFiles].map(async (key) => {
          try {
            const filePath = key
            const latest = mostRecent.trackedFileBackups[key]
            const nextVersion = latest ? latest.version + 1 : 1
            let exists = true
            try {
              await fs.stat(filePath)
            } catch {
              exists = false
            }
            if (!exists) {
              trackedFileBackups[key] = {
                backupFileName: null,
                version: nextVersion,
                backupTime: new Date().toISOString()
              }
              return
            }
            if (
              latest?.backupFileName &&
              !(await filesDiffer(filePath, this.sessionId, latest.backupFileName))
            ) {
              trackedFileBackups[key] = latest
              return
            }
            trackedFileBackups[key] = await createBackup(
              this.sessionId,
              filePath,
              nextVersion
            )
          } catch {
            /* best-effort per file */
          }
        })
      )
    }

    // Inherit any trackEdit that raced during async window
    const last = this.state.snapshots.at(-1)
    if (last) {
      for (const key of this.state.trackedFiles) {
        if (key in trackedFileBackups) continue
        const inherited = last.trackedFileBackups[key]
        if (inherited) trackedFileBackups[key] = inherited
      }
    }

    const snap: FileHistorySnapshot = {
      messageId,
      trackedFileBackups,
      timestamp: new Date().toISOString()
    }
    this.state.snapshots.push(snap)
    if (this.state.snapshots.length > MAX_SNAPSHOTS) {
      this.state.snapshots = this.state.snapshots.slice(-MAX_SNAPSHOTS)
    }
    this.state.snapshotSequence += 1
    this.queuePersist()
    await this.flush()
  }

  /**
   * Backup current contents BEFORE mutate. Must run after makeSnapshot.
   */
  async trackEdit(absPath: string, cwd: string): Promise<void> {
    if (!fileHistoryEnabled()) return
    if (!shouldTrackPath(absPath, cwd)) return

    const key = trackingKey(absPath)
    const mostRecent = this.state.snapshots.at(-1)
    // CC: missing snapshot → skip (makeSnapshot must run at turn start)
    if (!mostRecent) return
    if (mostRecent.trackedFileBackups[key]) {
      // Already backed up this turn — do not overwrite with post-edit content
      return
    }

    // Phase 2: async backup (CC createBackup outside state commit)
    const backup = await createBackup(this.sessionId, absPath, 1)

    // Phase 3: re-check after await — sibling trackEdit / makeSnapshot may have raced
    const latest = this.state.snapshots.at(-1)
    if (!latest || latest.trackedFileBackups[key]) return

    latest.trackedFileBackups = {
      ...latest.trackedFileBackups,
      [key]: backup
    }
    this.state.trackedFiles.add(key)
    this.queuePersist()
    await this.flush()
  }

  async rewind(
    messageId: string,
    opts?: { dryRun?: boolean }
  ): Promise<RewindResult> {
    const dryRun = opts?.dryRun === true
    if (!fileHistoryEnabled()) {
      return {
        ok: false,
        messageId,
        filesChanged: [],
        dryRun,
        error: 'file_history_disabled'
      }
    }
    const target = [...this.state.snapshots]
      .reverse()
      .find((s) => s.messageId === messageId)
    if (!target) {
      return {
        ok: false,
        messageId,
        filesChanged: [],
        dryRun,
        error: 'snapshot_not_found'
      }
    }

    const filesChanged: string[] = []
    for (const key of this.state.trackedFiles) {
      try {
        const filePath = key
        const targetBackup = target.trackedFileBackups[key]
        const backupFileName = targetBackup
          ? targetBackup.backupFileName
          : firstBackupName(key, this.state)

        if (backupFileName === undefined) continue

        if (backupFileName === null) {
          if (dryRun) {
            try {
              await fs.access(filePath)
              filesChanged.push(filePath)
            } catch {
              /* already absent */
            }
            continue
          }
          try {
            await fs.unlink(filePath)
            filesChanged.push(filePath)
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
          }
          continue
        }

        let originMissing = false
        try {
          await fs.access(filePath)
        } catch {
          originMissing = true
        }
        const changed =
          originMissing ||
          (await filesDiffer(filePath, this.sessionId, backupFileName))
        if (!changed) continue
        if (!dryRun) {
          await restoreBackup(filePath, this.sessionId, backupFileName)
        }
        filesChanged.push(filePath)
      } catch {
        /* continue other files */
      }
    }

    return { ok: true, messageId, filesChanged, dryRun }
  }
}

function firstBackupName(
  trackingPath: string,
  state: FileHistoryState
): string | null | undefined {
  for (const snap of state.snapshots) {
    const b = snap.trackedFileBackups[trackingPath]
    if (b) return b.backupFileName
  }
  return undefined
}

export type { FileHistoryState, FileHistorySnapshot, RewindResult }
