import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type RevisionEntry = {
  version: string
  savedAt: string
  instruction?: string
  summary?: string
}

export type RevisionIndex = {
  slug: string
  kind: 'uskill' | 'uplugin'
  entries: RevisionEntry[]
}

const MAX_REVISIONS = 10

function revisionsRoot(dataRoot: string): string {
  return join(dataRoot, 'openforu', 'revisions')
}

function indexPath(dataRoot: string, slug: string): string {
  return join(revisionsRoot(dataRoot), slug, 'index.json')
}

function snapshotDir(dataRoot: string, slug: string, version: string): string {
  return join(revisionsRoot(dataRoot), slug, version)
}

function listFilesRecursive(dir: string, base = dir): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const rel = full.slice(base.length + 1).replace(/\\/g, '/')
    if (statSync(full).isDirectory()) {
      Object.assign(out, listFilesRecursive(full, base))
    } else {
      out[rel] = readFileSync(full, 'utf-8')
    }
  }
  return out
}

export function readRevisionIndex(dataRoot: string, slug: string): RevisionIndex | null {
  const p = indexPath(dataRoot, slug)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as RevisionIndex
  } catch {
    return null
  }
}

/** 部署/Refine 前快照当前扩展目录 */
export function snapshotExtensionBeforeChange(
  dataRoot: string,
  kind: 'uskill' | 'uplugin',
  slug: string,
  version: string,
  meta?: { instruction?: string; summary?: string }
): void {
  const sourceDir = join(dataRoot, 'openforu', kind === 'uskill' ? 'uskills' : 'uplugins', slug)
  if (!existsSync(sourceDir)) return

  const dest = snapshotDir(dataRoot, slug, version)
  mkdirSync(dest, { recursive: true })

  for (const [rel, content] of Object.entries(listFilesRecursive(sourceDir))) {
    const target = join(dest, rel)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content, 'utf-8')
  }

  const index: RevisionIndex = readRevisionIndex(dataRoot, slug) ?? {
    slug,
    kind,
    entries: []
  }
  index.entries.unshift({
    version,
    savedAt: new Date().toISOString(),
    instruction: meta?.instruction,
    summary: meta?.summary
  })
  index.entries = index.entries.slice(0, MAX_REVISIONS)
  mkdirSync(join(revisionsRoot(dataRoot), slug), { recursive: true })
  writeFileSync(indexPath(dataRoot, slug), JSON.stringify(index, null, 2), 'utf-8')
}

export function listRevisionHistory(
  dataRoot: string,
  slug: string
): RevisionEntry[] {
  return readRevisionIndex(dataRoot, slug)?.entries ?? []
}

/** 回滚到指定版本快照 */
export function restoreExtensionRevision(
  dataRoot: string,
  kind: 'uskill' | 'uplugin',
  slug: string,
  targetVersion: string
): boolean {
  const snap = snapshotDir(dataRoot, slug, targetVersion)
  if (!existsSync(snap)) return false
  const liveDir = join(dataRoot, 'openforu', kind === 'uskill' ? 'uskills' : 'uplugins', slug)
  mkdirSync(liveDir, { recursive: true })
  cpSync(snap, liveDir, { recursive: true })
  return true
}

export function parseVersionFromExtensionId(id: string): string {
  const m = id.match(/@(\d+\.\d+\.\d+)$/)
  return m?.[1] ?? '1.0.0'
}
