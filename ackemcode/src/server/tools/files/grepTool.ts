import type { FileToolResult } from './types.js'
import { guardSignal } from './signalCheck.js'
import { GREP_DEFAULT_HEAD } from './grepConstants.js'
import { parseGrepInput } from './grepTypes.js'
import { grepToolDispatch } from './ripgrep.js'

export { GREP_DEFAULT_HEAD } from './grepConstants.js'

export type GrepOutputMode = 'content' | 'files_with_matches' | 'count'

export async function grepTool(
  cwd: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  additionalWorkingDirectories?: readonly string[]
): Promise<FileToolResult> {
  const aborted = guardSignal(signal)
  if (aborted) return aborted

  const parsed = parseGrepInput(cwd, input, additionalWorkingDirectories)
  if (!parsed.ok) return { ok: false, output: parsed.output }

  return grepToolDispatch(parsed.parsed, signal)
}
