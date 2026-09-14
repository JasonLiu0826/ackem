/**
 * Auto-memory paths — Claude Code memdir/paths.ts spirit.
 * Ackem root: ~/.ackemcode/memory/<project-slug>/ (roadmap M22).
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { findCanonicalGitRoot } from '../tools/worktree/worktree.js'

export const ENTRYPOINT_NAME = 'MEMORY.md'
export const MAX_ENTRYPOINT_LINES = 200
export const MAX_ENTRYPOINT_BYTES = 25_000

export function sanitizePathKey(p: string): string {
  return path.resolve(p).replace(/[^a-zA-Z0-9]/g, '-')
}

export function getAckemHome(): string {
  if (process.env.ACKEMCODE_HOME?.trim()) {
    return path.resolve(process.env.ACKEMCODE_HOME.trim())
  }
  return path.join(os.homedir(), '.ackemcode')
}

export function getMemoryBaseDir(): string {
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR?.trim()) {
    return path.resolve(process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR.trim())
  }
  if (process.env.ACKEM_MEMORY_BASE?.trim()) {
    return path.resolve(process.env.ACKEM_MEMORY_BASE.trim())
  }
  return path.join(getAckemHome(), 'memory')
}

export function isAutoMemoryEnabled(settings?: {
  autoMemoryEnabled?: boolean
}): boolean {
  const env =
    process.env.ACKEM_DISABLE_AUTO_MEMORY ||
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
  if (env === '1' || env === 'true') return false
  if (env === '0' || env === 'false') return true
  if (process.env.CLAUDE_CODE_SIMPLE === '1') return false
  if (settings?.autoMemoryEnabled === false) return false
  if (settings?.autoMemoryEnabled === true) return true
  return true
}

function validateMemoryPath(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  let candidate = raw.trim()
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    const rest = candidate.slice(2)
    const restNorm = path.normalize(rest || '.')
    if (restNorm === '.' || restNorm === '..') return undefined
    candidate = path.join(os.homedir(), rest)
  }
  const normalized = path.normalize(candidate).replace(/[/\\]+$/, '')
  if (
    !path.isAbsolute(normalized) ||
    normalized.length < 3 ||
    /^[A-Za-z]:$/.test(normalized) ||
    normalized.startsWith('\\\\') ||
    normalized.startsWith('//') ||
    normalized.includes('\0')
  ) {
    return undefined
  }
  return normalized
}

/** Full memdir override (Cowork / settings spirit). */
export function getAutoMemPathOverride(): string | undefined {
  return (
    validateMemoryPath(process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE) ||
    validateMemoryPath(process.env.ACKEM_MEMORY_DIR)
  )
}

export async function getAutoMemPath(cwd: string): Promise<string> {
  const override = getAutoMemPathOverride()
  if (override) return override
  const root =
    (await findCanonicalGitRoot(cwd)) || path.resolve(cwd || process.cwd())
  return path.join(getMemoryBaseDir(), sanitizePathKey(root))
}

export async function getAutoMemEntrypoint(cwd: string): Promise<string> {
  return path.join(await getAutoMemPath(cwd), ENTRYPOINT_NAME)
}

export function isPathInside(absPath: string, root: string): boolean {
  const a = path.resolve(absPath)
  const r = path.resolve(root)
  const rel = path.relative(r, a)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export async function isAutoMemPath(absPath: string, cwd: string): Promise<boolean> {
  if (!isAutoMemoryEnabled()) return false
  const mem = await getAutoMemPath(cwd)
  return isPathInside(absPath, mem)
}

export async function ensureMemoryDirExists(cwd: string): Promise<string> {
  const dir = await getAutoMemPath(cwd)
  await fs.mkdir(dir, { recursive: true })
  return dir
}
