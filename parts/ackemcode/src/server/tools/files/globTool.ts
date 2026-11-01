import { glob } from 'glob'
import type { FileToolResult } from './types.js'
import { cwdNote, isDirectory, resolveFileToolPath } from './pathUtils.js'
import { guardSignal } from './signalCheck.js'
import { GREP_IGNORE } from './grepConstants.js'

/** CC GlobTool default maxResults */
export const GLOB_DEFAULT_MAX = 100

export async function globTool(
  cwd: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  additionalWorkingDirectories?: readonly string[]
): Promise<FileToolResult> {
  const aborted = guardSignal(signal)
  if (aborted) return aborted
  const pattern = String(input.pattern ?? '**/*')
  const searchRootRaw = input.path != null ? String(input.path) : ''
  let searchCwd = cwd
  if (searchRootRaw) {
    let abs: string
    try {
      abs = resolveFileToolPath(cwd, searchRootRaw, {
        additionalWorkingDirectories
      })
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) }
    }
    if (!(await isDirectory(abs))) {
      try {
        await import('node:fs/promises').then((fs) => fs.access(abs))
        return { ok: false, output: `Path is not a directory: ${searchRootRaw}` }
      } catch {
        return {
          ok: false,
          output: `Directory does not exist: ${searchRootRaw}. ${cwdNote(cwd)}`
        }
      }
    }
    searchCwd = abs
  }

  // head_limit: Ackem alias; default 100; 0 = soft cap 10_000
  const rawHead = input.head_limit ?? input.max_results
  let maxResults = GLOB_DEFAULT_MAX
  if (rawHead != null && rawHead !== '') {
    const n = Number(rawHead)
    if (n === 0) maxResults = 10_000
    else if (Number.isFinite(n) && n > 0) maxResults = Math.min(Math.floor(n), 10_000)
  }

  const matches = await glob(pattern, {
    cwd: searchCwd,
    nodir: true,
    absolute: false,
    dot: true,
    ignore: [...GREP_IGNORE]
  })

  // Prefer mtime-ish order: glob order is fine; slice
  const truncated = matches.length > maxResults
  const list = matches.slice(0, maxResults)
  if (!list.length) {
    return { ok: true, output: 'No files found' }
  }
  let out = list.join('\n')
  if (truncated) {
    out +=
      '\n(Results are truncated. Consider using a more specific path or pattern.)'
  }
  return { ok: true, output: out }
}
