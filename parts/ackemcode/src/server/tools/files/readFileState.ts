/**
 * Per-session read tracking — Claude Code readFileState / read-before-write spirit.
 */
export type ReadFileEntry = {
  mtimeMs: number
  /** True only when the whole file was read (no offset/limit window). */
  complete: boolean
  /** Original (non-normalized) absolute path — for reinjection display/IO. */
  path: string
}

export class ReadFileState {
  private map = new Map<string, ReadFileEntry>()

  remember(absPath: string, mtimeMs: number, complete: boolean): void {
    const key = normalizeKey(absPath)
    // Delete + set so Map insertion order doubles as recency order (R3 reinjection).
    this.map.delete(key)
    this.map.set(key, { mtimeMs, complete, path: absPath })
  }

  get(absPath: string): ReadFileEntry | undefined {
    return this.map.get(normalizeKey(absPath))
  }

  /** R3: most-recently touched entries, newest first. */
  recent(n: number): ReadFileEntry[] {
    const all = [...this.map.values()]
    return all.slice(-Math.max(0, n)).reverse()
  }

  clear(absPath?: string): void {
    if (absPath) this.map.delete(normalizeKey(absPath))
    else this.map.clear()
  }
}

function normalizeKey(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

export function createReadFileState(): ReadFileState {
  return new ReadFileState()
}
