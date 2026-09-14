/**
 * MEMORY.md load + truncate — Claude Code memdir/memory.ts loadMemoryPrompt spirit.
 */
import fs from 'node:fs/promises'
import {
  ENTRYPOINT_NAME,
  MAX_ENTRYPOINT_BYTES,
  MAX_ENTRYPOINT_LINES,
  ensureMemoryDirExists,
  getAutoMemEntrypoint,
  getAutoMemPath,
  isAutoMemoryEnabled
} from './paths.js'
import { buildMemoryIndexMarkdown, scanMemoryFiles } from './scan.js'

export type LoadedMemoryPrompt = {
  memoryDir: string
  entrypointPath: string
  content: string
  truncated: boolean
  topicCount: number
}

export function truncateEntrypointContent(raw: string): {
  content: string
  truncated: boolean
} {
  const trimmed = raw.trim()
  const lines = trimmed.split(/\n/)
  const lineCount = lines.length
  const byteCount = Buffer.byteLength(trimmed, 'utf8')
  const wasLine = lineCount > MAX_ENTRYPOINT_LINES
  const wasByte = byteCount > MAX_ENTRYPOINT_BYTES
  if (!wasLine && !wasByte) {
    return { content: trimmed, truncated: false }
  }
  let truncated = wasLine
    ? lines.slice(0, MAX_ENTRYPOINT_LINES).join('\n')
    : trimmed
  if (Buffer.byteLength(truncated, 'utf8') > MAX_ENTRYPOINT_BYTES) {
    // cut at last newline before byte cap (CC spirit)
    let cut = truncated.length
    while (
      cut > 0 &&
      Buffer.byteLength(truncated.slice(0, cut), 'utf8') > MAX_ENTRYPOINT_BYTES
    ) {
      const nl = truncated.lastIndexOf('\n', cut - 1)
      cut = nl > 0 ? nl : cut - 1
    }
    truncated = truncated.slice(0, cut > 0 ? cut : MAX_ENTRYPOINT_BYTES)
  }
  const reason =
    wasByte && !wasLine
      ? `${byteCount} bytes (limit ${MAX_ENTRYPOINT_BYTES})`
      : wasLine && !wasByte
        ? `${lineCount} lines (limit ${MAX_ENTRYPOINT_LINES})`
        : `${lineCount} lines and ${byteCount} bytes`
  return {
    content:
      truncated +
      `\n\n> WARNING: ${ENTRYPOINT_NAME} is ${reason}. Only part of it was loaded. Keep index entries to one line; move detail into topic files.`,
    truncated: true
  }
}

export async function ensureMemoryIndex(cwd: string): Promise<string> {
  const dir = await ensureMemoryDirExists(cwd)
  const entry = await getAutoMemEntrypoint(cwd)
  try {
    await fs.access(entry)
  } catch {
    const headers = await scanMemoryFiles(dir)
    await fs.writeFile(entry, buildMemoryIndexMarkdown(headers), 'utf8')
  }
  return dir
}

export async function loadMemoryPrompt(
  cwd: string
): Promise<LoadedMemoryPrompt | null> {
  if (!isAutoMemoryEnabled()) return null
  const memoryDir = await ensureMemoryIndex(cwd)
  const entrypointPath = await getAutoMemEntrypoint(cwd)
  let raw = ''
  try {
    raw = await fs.readFile(entrypointPath, 'utf8')
  } catch {
    raw = ''
  }
  const headers = await scanMemoryFiles(memoryDir)
  if (!raw.trim() && headers.length === 0) {
    return {
      memoryDir,
      entrypointPath,
      content: '',
      truncated: false,
      topicCount: 0
    }
  }
  if (!raw.trim() && headers.length > 0) {
    raw = buildMemoryIndexMarkdown(headers)
    await fs.writeFile(entrypointPath, raw, 'utf8')
  }
  const { content, truncated } = truncateEntrypointContent(raw)
  return {
    memoryDir,
    entrypointPath,
    content,
    truncated,
    topicCount: headers.length
  }
}

export async function syncMemoryIndex(cwd: string): Promise<void> {
  if (!isAutoMemoryEnabled()) return
  const dir = await getAutoMemPath(cwd)
  const headers = await scanMemoryFiles(dir)
  const entry = await getAutoMemEntrypoint(cwd)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(entry, buildMemoryIndexMarkdown(headers), 'utf8')
}

export { ENTRYPOINT_NAME }
