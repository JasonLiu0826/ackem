import fs from 'node:fs/promises'
import path from 'node:path'
import { assertNoSecretsInMemory } from '../../memdir/secretScan.js'
import { isPathInside } from '../../memdir/paths.js'
import { cwdNote, resolveFileToolPath } from './pathUtils.js'
import type { ReadFileState } from './readFileState.js'
import type { FileToolResult } from './types.js'
import { guardSignal } from './signalCheck.js'
import {
  applyReplaceAll,
  applySingleReplace,
  findAllMatchSpans,
  findWhitespaceCollapsedUniqueLineMatch
} from './editMatch.js'
import {
  buildReplaceNotFoundHint,
  formatMissingFileMessage,
  suggestPathForMissingFile
} from './pathSuggestions.js'
import { clampToolHint } from './grepConstants.js'

export type FileToolPathOpts = {
  /** Session dirs granted outside cwd (CC additionalWorkingDirectories). */
  additionalWorkingDirectories?: readonly string[]
  /** Auto-memory directory carve-out (CC isAutoMemPath). */
  memoryDir?: string | null
  onMemoryWrite?: () => void
  signal?: AbortSignal
  /**
   * S06: backup current contents BEFORE mutate (CC fileHistoryTrackEdit).
   * Must be invoked prior to writeFile / search-replace on disk.
   */
  trackFileEdit?: (absPath: string) => void | Promise<void>
}

function guardMemoryWrite(abs: string, content: string, memoryDir?: string | null): string | null {
  if (!memoryDir || !isPathInside(abs, memoryDir)) return null
  try {
    assertNoSecretsInMemory(content)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  return null
}

async function assertWritable(
  cwd: string,
  abs: string,
  readState?: ReadFileState
): Promise<string | null> {
  let st: Awaited<ReturnType<typeof fs.stat>> | null = null
  try {
    st = await fs.stat(abs)
  } catch {
    // new file — allowed without prior read (CC)
    return null
  }
  if (st.isDirectory()) {
    return `EISDIR: illegal operation on a directory`
  }
  if (!readState) {
    // no tracking (e.g. unit tests) — allow
    return null
  }
  const entry = readState.get(abs)
  if (!entry) {
    return `File has not been read yet. Read it first before writing to it.`
  }
  if (!entry.complete) {
    return `File has not been read yet. Read it first before writing to it. (Previous read used offset/limit — read the full file.)`
  }
  if (Math.abs(st.mtimeMs - entry.mtimeMs) > 1) {
    return `File has been modified since read, either by the user or by a linter. Read it again before writing to it.`
  }
  return null
}

export async function writeFileTool(
  cwd: string,
  input: Record<string, unknown>,
  readState?: ReadFileState,
  pathOpts?: FileToolPathOpts
): Promise<FileToolResult> {
  const earlyAbort = guardSignal(pathOpts?.signal)
  if (earlyAbort) return earlyAbort
  const rel = String(input.path ?? input.file_path ?? '')
  let abs: string
  try {
    abs = resolveFileToolPath(cwd, rel, {
      additionalWorkingDirectories: pathOpts?.additionalWorkingDirectories,
      memoryDir: pathOpts?.memoryDir
    })
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }

  const content = String(input.content ?? '')
  const secretErr = guardMemoryWrite(abs, content, pathOpts?.memoryDir)
  if (secretErr) return { ok: false, output: secretErr }

  let existed = false
  try {
    await fs.access(abs)
    existed = true
  } catch {
    existed = false
  }

  if (existed) {
    const err = await assertWritable(cwd, abs, readState)
    if (err) return { ok: false, output: err }
  }

  const beforeWrite = guardSignal(pathOpts?.signal)
  if (beforeWrite) return beforeWrite
  try {
    await pathOpts?.trackFileEdit?.(abs)
  } catch {
    /* checkpoint best-effort — never block the write */
  }
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  const st = await fs.stat(abs)
  readState?.remember(abs, st.mtimeMs, true)
  if (pathOpts?.memoryDir && isPathInside(abs, pathOpts.memoryDir)) {
    pathOpts.onMemoryWrite?.()
  }

  if (!existed) {
    return { ok: true, output: `File created successfully at: ${rel}` }
  }
  return { ok: true, output: `The file ${rel} has been updated successfully.` }
}

export async function searchReplaceTool(
  cwd: string,
  input: Record<string, unknown>,
  readState?: ReadFileState,
  pathOpts?: FileToolPathOpts
): Promise<FileToolResult> {
  const earlyAbort = guardSignal(pathOpts?.signal)
  if (earlyAbort) return earlyAbort
  const rel = String(input.path ?? input.file_path ?? '')
  let abs: string
  try {
    abs = resolveFileToolPath(cwd, rel, {
      additionalWorkingDirectories: pathOpts?.additionalWorkingDirectories,
      memoryDir: pathOpts?.memoryDir
    })
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }

  const oldStr = String(input.old_string ?? '')
  const newStr = String(input.new_string ?? '')
  const replaceAll = Boolean(input.replace_all)

  if (oldStr === newStr) {
    return {
      ok: false,
      output: 'No changes to make: old_string and new_string are exactly the same.'
    }
  }

  let raw: string
  try {
    raw = await fs.readFile(abs, 'utf8')
  } catch {
    const suggestion = await suggestPathForMissingFile(cwd, rel)
    return {
      ok: false,
      output: formatMissingFileMessage(cwd, rel, suggestion)
    }
  }

  const markMem = () => {
    if (pathOpts?.memoryDir && isPathInside(abs, pathOpts.memoryDir)) {
      pathOpts.onMemoryWrite?.()
    }
  }

  // Create-via-empty-old_string (CC special case)
  if (oldStr === '') {
    if (raw.length > 0) {
      return { ok: false, output: 'Cannot create new file - file already exists.' }
    }
    const secretErr = guardMemoryWrite(abs, newStr, pathOpts?.memoryDir)
    if (secretErr) return { ok: false, output: secretErr }
    const err = await assertWritable(cwd, abs, readState)
    // empty file may not have been "read" — allow create fill if empty
    if (err && !err.includes('not been read')) {
      /* keep */
    }
    const beforeWrite = guardSignal(pathOpts?.signal)
    if (beforeWrite) return beforeWrite
    try {
      await pathOpts?.trackFileEdit?.(abs)
    } catch {
      /* checkpoint best-effort */
    }
    await fs.writeFile(abs, newStr, 'utf8')
    const st = await fs.stat(abs)
    readState?.remember(abs, st.mtimeMs, true)
    markMem()
    return { ok: true, output: `The file ${rel} has been updated successfully.` }
  }

  {
    const err = await assertWritable(cwd, abs, readState)
    if (err) return { ok: false, output: err }
  }

  let matches = countOccurrences(raw, oldStr)
  let next: string | null = null
  let whitespaceWarning = ''

  if (matches === 0) {
    let spans = findAllMatchSpans(raw, oldStr)
    if (spans.length === 0) {
      const ws = findWhitespaceCollapsedUniqueLineMatch(raw, oldStr)
      if (ws) {
        spans = [ws]
        whitespaceWarning =
          'Warning: matched after normalizing whitespace on a single line (verify the edit).\n'
      }
    }
    if (spans.length === 0) {
      const hint = buildReplaceNotFoundHint(raw, oldStr)
      let output = `String to replace not found in file.\nString: ${oldStr}`
      if (hint) output += `\n${hint}`
      return { ok: false, output: clampToolHint(output) }
    }
    matches = spans.length
    if (matches > 1 && !replaceAll) {
      return {
        ok: false,
        output: `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, provide more context around old_string to make it unique.\nString: ${oldStr}`
      }
    }
    next = replaceAll
      ? applyReplaceAll(raw, spans, oldStr, newStr)
      : applySingleReplace(raw, spans[0]!, oldStr, newStr)
  } else {
    if (matches > 1 && !replaceAll) {
      return {
        ok: false,
        output: `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, provide more context around old_string to make it unique.\nString: ${oldStr}`
      }
    }
    next = replaceAll ? raw.split(oldStr).join(newStr) : raw.replace(oldStr, newStr)
  }
  const secretErr = guardMemoryWrite(abs, next, pathOpts?.memoryDir)
  if (secretErr) return { ok: false, output: secretErr }
  const beforeWrite = guardSignal(pathOpts?.signal)
  if (beforeWrite) return beforeWrite
  try {
    await pathOpts?.trackFileEdit?.(abs)
  } catch {
    /* checkpoint best-effort */
  }
  await fs.writeFile(abs, next, 'utf8')
  const st = await fs.stat(abs)
  readState?.remember(abs, st.mtimeMs, true)
  markMem()

  const successPrefix = whitespaceWarning || ''
  if (replaceAll && matches > 1) {
    return {
      ok: true,
      output:
        successPrefix +
        `The file ${rel} has been updated successfully. All occurrences were successfully replaced.`
    }
  }
  return {
    ok: true,
    output: successPrefix + `The file ${rel} has been updated successfully.`
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let i = 0
  while (true) {
    const idx = haystack.indexOf(needle, i)
    if (idx === -1) break
    count++
    i = idx + needle.length
  }
  return count
}
