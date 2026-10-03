/**
 * Path helpers for file tools — expand + cwd sandbox (Ackem host constraint).
 * CC expandPath spirit; memdir carve-out via allowRoots (isAutoMemPath spirit).
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'

const MAX_REALPATH_WALK = 64

function resolveRootReal(root: string): string {
  const resolved = path.resolve(root)
  try {
    return fsSync.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/**
 * True when `absPath` resolves to a location under `root` (follows symlinks/junctions).
 */
export function isPathContainedInRoot(absPath: string, root: string): boolean {
  const rootReal = resolveRootReal(root)
  let probe = path.resolve(absPath)
  for (let i = 0; i < MAX_REALPATH_WALK; i++) {
    try {
      const targetReal = fsSync.realpathSync.native(probe)
      const rel = path.relative(rootReal, targetReal)
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        const parent = path.dirname(probe)
        if (parent === probe) return false
        probe = parent
        continue
      }
      throw e
    }
  }
  return false
}

function isInsideRootLexical(absPath: string, root: string): boolean {
  const a = path.resolve(absPath)
  const r = path.resolve(root)
  const rel = path.relative(r, a)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Reject paths that lexically stay in root but escape via symlink/junction segments. */
function collectRelativeSymlinkTargets(
  root: string,
  targetAbs: string,
  into: Set<string>
): void {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(targetAbs)
  const rel = path.relative(rootResolved, targetResolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return

  const parts = rel.split(path.sep).filter(Boolean)
  let cur = rootResolved
  for (const part of parts) {
    cur = path.join(cur, part)
    try {
      const st = fsSync.lstatSync(cur)
      if (st.isSymbolicLink()) {
        into.add(cur)
        const linkReal = fsSync.realpathSync.native(cur)
        into.add(linkReal)
        cur = linkReal
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      throw e
    }
  }
}

/** All absolute paths to check for permissions (CC getPathsForPermissionCheck spirit). */
export function pathsForPermissionCheck(cwd: string, filePath: string): string[] {
  const abs = expandPath(cwd, filePath)
  const set = new Set<string>([abs])
  try {
    set.add(fsSync.realpathSync.native(abs))
  } catch {
    /* new path — ancestor symlinks still matter */
  }
  collectRelativeSymlinkTargets(path.resolve(cwd), abs, set)
  return [...set]
}

export function pathInAllowedWorkingPaths(
  cwd: string,
  filePath: string,
  additionalDirs: readonly string[]
): boolean {
  const pathsToCheck = pathsForPermissionCheck(cwd, filePath)
  const roots = [
    path.resolve(cwd),
    ...additionalDirs.filter(Boolean).map((d) => path.resolve(d))
  ]
  return pathsToCheck.every((p) =>
    roots.some((root) => isPathContainedInRoot(p, root))
  )
}

export function buildFileAllowRoots(opts: {
  additionalWorkingDirectories?: readonly string[]
  memoryDir?: string | null
  toolResultsRoot?: string | null
  /** Interview plan file (often ~/.ackemcode/plans/*.md, outside cwd). */
  planFilePath?: string | null
}): string[] {
  const allow: string[] = []
  for (const d of opts.additionalWorkingDirectories ?? []) {
    if (d?.trim()) allow.push(path.resolve(d))
  }
  if (opts.memoryDir?.trim()) allow.push(path.resolve(opts.memoryDir))
  if (opts.toolResultsRoot?.trim()) allow.push(path.resolve(opts.toolResultsRoot))
  if (opts.planFilePath?.trim()) {
    allow.push(path.dirname(path.resolve(opts.planFilePath)))
  }
  return allow
}

export function resolveFileToolPath(
  cwd: string,
  filePath: string,
  opts?: {
    additionalWorkingDirectories?: readonly string[]
    memoryDir?: string | null
    toolResultsRoot?: string | null
    planFilePath?: string | null
  }
): string {
  const allow = buildFileAllowRoots(opts ?? {})
  return resolveInCwd(cwd, filePath, allow.length ? allow : undefined)
}

function assertNoSymlinkEscape(root: string, targetAbs: string): void {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(targetAbs)
  const rel = path.relative(rootResolved, targetResolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return

  const parts = rel.split(path.sep).filter(Boolean)
  let cur = rootResolved
  for (const part of parts) {
    cur = path.join(cur, part)
    let st: fsSync.Stats
    try {
      st = fsSync.lstatSync(cur)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      throw e
    }
    if (st.isSymbolicLink()) {
      const linkReal = fsSync.realpathSync.native(cur)
      if (!isPathContainedInRoot(linkReal, rootResolved)) {
        throw new Error(
          `Path escapes working directory via symbolic link: ${part}`
        )
      }
      cur = linkReal
    }
  }
}

function assertContainedInRoot(root: string, targetAbs: string): void {
  assertNoSymlinkEscape(root, targetAbs)
  const abs = path.resolve(targetAbs)
  const rootAbs = path.resolve(root)
  const parent = path.dirname(abs)
  if (!fsSync.existsSync(abs) && parent === rootAbs) {
    return
  }
  const probe = fsSync.existsSync(abs) ? abs : parent
  if (!isPathContainedInRoot(probe, root)) {
    throw new Error(`Path escapes working directory: ${targetAbs}`)
  }
}

export function expandPath(cwd: string, filePath: string): string {
  let p = String(filePath ?? '').trim()
  if (!p) throw new Error('path is required')
  if (p.includes('\0')) throw new Error('path contains null byte')
  if (p === '~') p = process.env.HOME || process.env.USERPROFILE || cwd
  else if (p.startsWith('~/') || p.startsWith('~\\')) {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    p = path.join(home, p.slice(2))
  }
  return path.resolve(cwd, p)
}

/**
 * Resolve path under cwd, or under optional allowRoots (auto-memory dir).
 */
export function resolveInCwd(
  cwd: string,
  filePath: string,
  allowRoots?: string[] | null
): string {
  const resolved = expandPath(cwd, filePath)
  const root = path.resolve(cwd)
  if (isInsideRootLexical(resolved, root)) {
    assertContainedInRoot(root, resolved)
    return resolved
  }
  for (const allow of allowRoots ?? []) {
    if (allow && isInsideRootLexical(resolved, allow)) {
      assertContainedInRoot(path.resolve(allow), resolved)
      return resolved
    }
  }
  throw new Error(`Path escapes working directory: ${filePath}`)
}

export function cwdNote(cwd: string): string {
  return `Note: your current working directory is ${cwd}.`
}

export async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(abs: string): Promise<boolean> {
  try {
    const st = await fs.stat(abs)
    return st.isDirectory()
  } catch {
    return false
  }
}
