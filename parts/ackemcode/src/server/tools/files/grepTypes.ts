import { resolveFileToolPath } from './pathUtils.js'
import { GREP_DEFAULT_HEAD } from './grepConstants.js'

export type GrepOutputMode = 'content' | 'files_with_matches' | 'count'

export type ParsedGrepInput = {
  cwd: string
  searchCwd: string
  searchPath: string
  pattern: string
  userGlob?: string
  caseInsensitive: boolean
  mode: GrepOutputMode
  headLimit: number
  offset: number
  contextBefore: number
  contextAfter: number
  type?: string
  multiline: boolean
}

export function parseGrepInput(
  cwd: string,
  input: Record<string, unknown>,
  additionalWorkingDirectories?: readonly string[]
): { ok: true; parsed: ParsedGrepInput } | { ok: false; output: string } {
  const pattern = String(input.pattern ?? '')
  if (!pattern) return { ok: false, output: 'pattern is required' }

  const userGlob =
    input.glob != null && String(input.glob).trim() !== ''
      ? String(input.glob)
      : undefined

  const caseInsensitive = Boolean(
    input.case_insensitive ?? input['-i'] ?? input.i
  )
  const modeRaw = String(input.output_mode ?? 'content')
  const mode: GrepOutputMode =
    modeRaw === 'files_with_matches' || modeRaw === 'count' ? modeRaw : 'content'

  const rawHead = input.head_limit
  let headLimit = GREP_DEFAULT_HEAD
  if (rawHead != null && rawHead !== '') {
    const n = Number(rawHead)
    if (n === 0) headLimit = 50_000
    else if (Number.isFinite(n) && n > 0) headLimit = Math.floor(n)
  }
  const offset = Math.max(0, Math.floor(Number(input.offset ?? 0)) || 0)

  const ctx = Number(input['-C'] ?? input.context ?? 0)
  let contextBefore = Math.max(0, Math.floor(Number(input['-B'] ?? 0)) || 0)
  let contextAfter = Math.max(0, Math.floor(Number(input['-A'] ?? 0)) || 0)
  if (Number.isFinite(ctx) && ctx > 0) {
    contextBefore = Math.floor(ctx)
    contextAfter = Math.floor(ctx)
  }

  const typeRaw = input.type != null ? String(input.type).trim() : ''
  const type = typeRaw || undefined
  const multiline = Boolean(input.multiline)

  const searchPath = input.path != null ? String(input.path) : ''
  let searchCwd = cwd
  if (searchPath) {
    try {
      searchCwd = resolveFileToolPath(cwd, searchPath, {
        additionalWorkingDirectories
      })
    } catch (e) {
      return {
        ok: false,
        output: e instanceof Error ? e.message : String(e)
      }
    }
  }

  return {
    ok: true,
    parsed: {
      cwd,
      searchCwd,
      searchPath,
      pattern,
      userGlob,
      caseInsensitive,
      mode,
      headLimit,
      offset,
      contextBefore,
      contextAfter,
      type,
      multiline
    }
  }
}
