/**
 * File-tool path permission (CC checkReadPermissionForTool / additionalWorkingDirectories spirit).
 */
import path from 'node:path'
import fsSync from 'node:fs'
import {
  expandPath,
  pathInAllowedWorkingPaths,
  pathsForPermissionCheck
} from '../tools/files/pathUtils.js'
import { getGlobBaseDirectory } from './pathValidation.js'
import { normalizeToolName } from './permissionRules.js'
import type { PermissionBroker } from './permissions.js'
import { grantWorkingDirectoriesFromShellCommand } from './shellPathPermissions.js'

export type FilePathOp = 'read' | 'write'

const READ_PATH_TOOLS = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir'
])

const WRITE_PATH_TOOLS = new Set([
  'write_file',
  'search_replace',
  'notebook_edit'
])

export function fileToolPathOperation(toolName: string): FilePathOp | null {
  const n = normalizeToolName(toolName)
  if (READ_PATH_TOOLS.has(n)) return 'read'
  if (WRITE_PATH_TOOLS.has(n)) return 'write'
  return null
}

/** Path subject for permission / working-dir grants (CC getPath spirit). */
export function extractFileToolPath(
  toolName: string,
  input: unknown,
  cwd: string
): string | null {
  const n = normalizeToolName(toolName)
  const obj =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}

  if (n === 'read_file' || n === 'write_file' || n === 'search_replace') {
    const p = String(obj.path ?? obj.file_path ?? '').trim()
    return p || null
  }
  if (n === 'notebook_edit') {
    const p = String(
      obj.notebook_path ?? obj.path ?? obj.file_path ?? ''
    ).trim()
    return p || null
  }
  if (n === 'glob') {
    const pattern = String(obj.pattern ?? '').trim()
    if (!pattern) return null
    const base = getGlobBaseDirectory(pattern)
    return base === '.' ? cwd : expandPath(cwd, base)
  }
  if (n === 'grep') {
    const p = String(obj.path ?? '').trim()
    return p ? expandPath(cwd, p) : cwd
  }
  if (n === 'list_dir') {
    const p = String(obj.path ?? '.').trim() || '.'
    return expandPath(cwd, p)
  }
  return null
}

export function directoryForWorkingGrant(
  toolPath: string,
  cwd: string
): string {
  const abs = path.isAbsolute(toolPath)
    ? path.resolve(toolPath)
    : expandPath(cwd, toolPath)
  try {
    const st = fsSync.lstatSync(abs)
    if (st.isDirectory()) return abs
  } catch {
    /* parent */
  }
  return path.dirname(abs)
}

/**
 * Outside cwd + additional session dirs → ask (CC workingDir decisionReason).
 */
export function filePathOutsideWorkingDirs(opts: {
  toolName: string
  input?: unknown
  cwd?: string
  additionalWorkingDirectories?: readonly string[]
}): { outside: boolean; path: string | null; reason: string } {
  const cwd = opts.cwd?.trim()
  if (!cwd) {
    return { outside: false, path: null, reason: '' }
  }
  const op = fileToolPathOperation(opts.toolName)
  if (!op) {
    return { outside: false, path: null, reason: '' }
  }
  const filePath = extractFileToolPath(opts.toolName, opts.input, cwd)
  if (!filePath) {
    return { outside: false, path: null, reason: '' }
  }
  const extra = opts.additionalWorkingDirectories ?? []
  if (pathInAllowedWorkingPaths(cwd, filePath, extra)) {
    return { outside: false, path: filePath, reason: '' }
  }
  const label =
    op === 'read'
      ? 'Path is outside allowed working directories (ask required)'
      : 'Path escapes working directory (ask required)'
  return {
    outside: true,
    path: filePath,
    reason: `${label}: ${filePath}`
  }
}

/** After user allows a file tool, extend session working dirs (CC addDirectories). */
export function grantWorkingDirectoryForToolPath(
  toolName: string,
  input: unknown,
  cwd: string,
  broker: PermissionBroker
): void {
  const n = normalizeToolName(toolName)
  if (n === 'bash' || n === 'powershell') {
    const command =
      input && typeof input === 'object' && !Array.isArray(input)
        ? String((input as Record<string, unknown>).command ?? '')
        : ''
    grantWorkingDirectoriesFromShellCommand(
      n,
      command,
      cwd,
      (dir) => broker.addAdditionalWorkingDirectory(dir)
    )
    return
  }

  const op = fileToolPathOperation(toolName)
  if (!op) return
  const filePath = extractFileToolPath(toolName, input, cwd)
  if (!filePath) return
  if (
    pathInAllowedWorkingPaths(cwd, filePath, broker.getAdditionalWorkingDirectories())
  ) {
    return
  }
  const dir = directoryForWorkingGrant(filePath, cwd)
  const toAdd = new Set<string>([path.resolve(dir)])
  for (const p of pathsForPermissionCheck(cwd, dir)) {
    toAdd.add(path.resolve(p))
    try {
      const st = fsSync.lstatSync(p)
      if (st.isDirectory()) toAdd.add(path.resolve(p))
      else toAdd.add(path.dirname(path.resolve(p)))
    } catch {
      toAdd.add(path.resolve(dir))
    }
  }
  for (const d of toAdd) broker.addAdditionalWorkingDirectory(d)
}
