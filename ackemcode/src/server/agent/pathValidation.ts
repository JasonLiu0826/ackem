/**
 * Path validation for permission decisions — Claude Code pathValidation spirit
 * (lightweight; Ackem-owned, no Anthropic source).
 */
import os from 'node:os'
import path from 'node:path'
import { extractSubject, normalizeToolName } from './permissionRules.js'
import {
  isPathContainedInRoot,
  pathInAllowedWorkingPaths
} from '../tools/files/pathUtils.js'

export type FileOperationType = 'read' | 'write' | 'create'

export type PathCheckResult = {
  ok: boolean
  reason: string
  resolvedPath?: string
}

const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:[\\/]?$/
const WINDOWS_DRIVE_CHILD = /^[A-Za-z]:[\\/][^\\/]+$/

/** Expand leading `~` / `~/` only (not ~user — security). */
export function expandTilde(p: string, home = os.homedir()): string {
  const s = String(p ?? '').trim()
  if (!s) return s
  if (s === '~') return home
  if (s.startsWith('~/') || s.startsWith('~\\')) {
    return path.join(home, s.slice(2))
  }
  return s
}

export function normalizePathSlashes(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
}

/**
 * Dangerous targets for rm/rmdir-style removal (CC isDangerousRemovalPath spirit).
 */
export function isDangerousRemovalPath(
  resolvedPath: string,
  home = os.homedir()
): boolean {
  const raw = String(resolvedPath ?? '').trim()
  if (!raw) return false
  if (raw === '*' || raw.endsWith('/*') || raw.endsWith('\\*')) return true

  const normalized = normalizePathSlashes(path.resolve(expandTilde(raw, home)))
  if (normalized === '/' || normalized === '') return true
  if (WINDOWS_DRIVE_ROOT.test(normalized)) return true

  const homeNorm = normalizePathSlashes(path.resolve(home))
  if (normalized === homeNorm) return true

  // Direct children of root: /usr, /tmp, /etc (not /usr/local)
  const parts = normalized.split('/').filter(Boolean)
  if (normalized.startsWith('/') && parts.length === 1) return true
  if (WINDOWS_DRIVE_CHILD.test(normalized)) return true

  return false
}

export function isPathInsideRoot(absPath: string, root: string): boolean {
  return isPathContainedInRoot(absPath, root)
}

/**
 * Resolve a tool path for permission checks (does not throw on escape).
 */
export function resolvePathForPermissionCheck(
  filePath: string,
  cwd: string
): { resolved: string; insideCwd: boolean } {
  const expanded = expandTilde(filePath)
  const resolved = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(cwd, expanded)
  return {
    resolved,
    insideCwd: isPathInsideRoot(resolved, cwd)
  }
}

/** Detect unresolved env/shell expansion that we refuse to auto-allow. */
export function pathHasUnresolvedExpansion(filePath: string): boolean {
  const s = String(filePath ?? '')
  if (/\$[A-Za-z_]/.test(s) || /\$\{/.test(s) || /\$\(/.test(s)) return true
  if (/%[A-Za-z][\w]*%/.test(s)) return true
  // ~user (not ~/ or bare ~)
  if (/^~[^/\\]/.test(s.trim())) return true
  return false
}

export function getGlobBaseDirectory(pattern: string): string {
  const p = String(pattern ?? '').replace(/\\/g, '/')
  const star = p.search(/[*?[{]/)
  if (star === -1) return path.dirname(p) || '.'
  const before = p.slice(0, star)
  const slash = before.lastIndexOf('/')
  if (slash === -1) return '.'
  return before.slice(0, slash) || '/'
}

/**
 * Validate a write/edit path under acceptEdits / auto in-project auto-allow.
 */
export function validateWritePathForAutoAllow(opts: {
  filePath: string
  cwd?: string
  additionalWorkingDirectories?: readonly string[]
}): PathCheckResult {
  const cwd = opts.cwd?.trim()
  if (!cwd) {
    return {
      ok: false,
      reason: 'acceptEdits/auto write auto-allow requires cwd for path check'
    }
  }
  const raw = String(opts.filePath ?? '').trim()
  if (!raw) {
    return { ok: false, reason: 'Missing path for write/edit tool' }
  }
  if (raw.includes('\0')) {
    return { ok: false, reason: 'Path contains null byte' }
  }
  if (pathHasUnresolvedExpansion(raw)) {
    return {
      ok: false,
      reason: `Path has unresolved expansion (ask required): ${raw}`
    }
  }
  const { resolved } = resolvePathForPermissionCheck(raw, cwd)
  const extra = opts.additionalWorkingDirectories ?? []
  if (!pathInAllowedWorkingPaths(cwd, raw, extra)) {
    return {
      ok: false,
      reason: `Path escapes working directory (ask required): ${raw}`,
      resolvedPath: resolved
    }
  }
  return { ok: true, reason: 'inside allowed working paths', resolvedPath: resolved }
}

/**
 * Extract and validate path from a file tool input for permission modes.
 */
export function validateToolPathForMode(opts: {
  toolName: string
  input?: unknown
  cwd?: string
  op?: FileOperationType
  additionalWorkingDirectories?: readonly string[]
}): PathCheckResult {
  const name = normalizeToolName(opts.toolName)
  const subject = extractSubject(name, opts.input)
  if (
    name === 'write_file' ||
    name === 'search_replace' ||
    name === 'notebook_edit'
  ) {
    const pathKey =
      name === 'notebook_edit'
        ? String(
            (opts.input as Record<string, unknown> | undefined)?.notebook_path ??
              (opts.input as Record<string, unknown> | undefined)?.path ??
              subject
          )
        : subject
    return validateWritePathForAutoAllow({
      filePath: pathKey,
      cwd: opts.cwd,
      additionalWorkingDirectories: opts.additionalWorkingDirectories
    })
  }
  if (name === 'glob' && opts.cwd) {
    const base = getGlobBaseDirectory(subject)
    return validateWritePathForAutoAllow({
      filePath: base,
      cwd: opts.cwd,
      additionalWorkingDirectories: opts.additionalWorkingDirectories
    })
  }
  return { ok: true, reason: 'no path gate' }
}
