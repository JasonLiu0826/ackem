import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'
import type { FileToolResult } from './types.js'
import { cwdNote } from './pathUtils.js'
import { guardSignal } from './signalCheck.js'
import { GREP_IGNORE, GREP_TYPE_SUFFIXES, clampToolHint } from './grepConstants.js'
import type { GrepOutputMode, ParsedGrepInput } from './grepTypes.js'

type Hit = { file: string; line: number; text: string; contextBefore?: string[]; contextAfter?: string[] }

async function isLikelyTextFile(abs: string): Promise<boolean> {
  try {
    const buf = Buffer.alloc(8192)
    const fh = await fs.open(abs, 'r')
    try {
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      if (bytesRead === 0) return true
      return !buf.subarray(0, bytesRead).includes(0)
    } finally {
      await fh.close()
    }
  } catch {
    return false
  }
}

function suffixAllowed(rel: string, type?: string): boolean {
  if (!type) return true
  const exts = GREP_TYPE_SUFFIXES[type.toLowerCase()]
  if (!exts) return false
  const ext = path.extname(rel).toLowerCase()
  return exts.includes(ext)
}

function buildRegex(pattern: string, caseInsensitive: boolean, multiline: boolean): RegExp {
  let flags = caseInsensitive ? 'i' : ''
  if (multiline) flags += 'ms'
  return new RegExp(pattern, flags)
}

function appendNoMatchGlobHint(out: string, userGlob?: string): string {
  if (!userGlob?.trim()) return out
  return clampToolHint(
    `${out}\nNo matches in glob ${userGlob}; omit glob to search the whole project.`
  )
}

export async function grepNodeScan(
  parsed: ParsedGrepInput,
  signal?: AbortSignal
): Promise<FileToolResult> {
  const {
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
  } = parsed

  if (type && !GREP_TYPE_SUFFIXES[type.toLowerCase()]) {
    return {
      ok: false,
      output: `Unknown type "${type}". Supported: ${Object.keys(GREP_TYPE_SUFFIXES).join(', ')}`
    }
  }

  let re: RegExp
  try {
    re = buildRegex(pattern, caseInsensitive, Boolean(multiline))
  } catch (e) {
    return {
      ok: false,
      output: `Invalid regex: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  const fileGlob = userGlob?.trim() ? userGlob : '**/*'

  let files: string[]
  try {
    files = await glob(fileGlob, {
      cwd: searchCwd,
      nodir: true,
      absolute: false,
      ignore: [...GREP_IGNORE]
    })
  } catch (e) {
    return {
      ok: false,
      output: `Path does not exist: ${searchPath || cwd}. ${cwdNote(cwd)} (${e instanceof Error ? e.message : String(e)})`
    }
  }

  const contentHits: Hit[] = []
  const fileHits = new Set<string>()
  const counts = new Map<string, number>()

  for (const rel of files) {
    const mid = guardSignal(signal)
    if (mid) return mid
    if (!suffixAllowed(rel, type)) continue

    const abs = path.join(searchCwd, rel)
    if (!(await isLikelyTextFile(abs))) continue

    const display =
      searchCwd === cwd
        ? rel
        : `${searchPath.replace(/\\/g, '/').replace(/\/$/, '')}/${rel}`

    let text: string
    try {
      text = await fs.readFile(abs, 'utf8')
    } catch {
      continue
    }

    if (multiline) {
      if (re.test(text)) {
        fileHits.add(display)
        counts.set(display, (counts.get(display) ?? 0) + 1)
        if (mode === 'content') {
          const firstLine = text.split(/\r?\n/)[0] ?? ''
          contentHits.push({ file: display, line: 1, text: firstLine.slice(0, 500) })
        }
      }
      continue
    }

    const lines = text.split(/\r?\n/)
    let fileCount = 0
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i]!)) continue
      fileCount++
      fileHits.add(display)
      if (mode === 'content') {
        const before: string[] = []
        const after: string[] = []
        for (let b = 1; b <= contextBefore; b++) {
          if (i - b >= 0) before.unshift(lines[i - b]!)
        }
        for (let a = 1; a <= contextAfter; a++) {
          if (i + a < lines.length) after.push(lines[i + a]!)
        }
        contentHits.push({
          file: display,
          line: i + 1,
          text: lines[i]!,
          contextBefore: before.length ? before : undefined,
          contextAfter: after.length ? after : undefined
        })
      }
    }
    if (fileCount > 0) counts.set(display, fileCount)
  }

  if (mode === 'files_with_matches') {
    const all = [...fileHits]
    const page = all.slice(offset, offset + headLimit)
    if (!page.length) {
      return { ok: true, output: appendNoMatchGlobHint('No files found', userGlob) }
    }
    let out = `Found ${all.length} file(s)\n` + page.join('\n')
    if (offset > 0 || page.length < all.length) {
      out += `\n[Showing results with pagination = limit: ${headLimit}, offset: ${offset}]`
    }
    return { ok: true, output: out }
  }

  if (mode === 'count') {
    const entries = [...counts.entries()]
    const page = entries.slice(offset, offset + headLimit)
    if (!page.length) {
      return { ok: true, output: appendNoMatchGlobHint('No matches found', userGlob) }
    }
    const totalOcc = entries.reduce((s, [, n]) => s + n, 0)
    const lines = page.map(([f, n]) => `${f}:${n}`)
    let out =
      lines.join('\n') +
      `\nFound ${totalOcc} occurrences across ${entries.length} files`
    if (offset > 0 || page.length < entries.length) {
      out += `\n[Showing results with pagination = limit: ${headLimit}, offset: ${offset}]`
    }
    return { ok: true, output: out }
  }

  const page = contentHits.slice(offset, offset + headLimit)
  if (!page.length) {
    return { ok: true, output: appendNoMatchGlobHint('No matches found', userGlob) }
  }
  const chunks: string[] = []
  for (const h of page) {
    if (h.contextBefore?.length) {
      for (let j = 0; j < h.contextBefore.length; j++) {
        chunks.push(`${h.file}:${h.line - h.contextBefore.length + j}:${h.contextBefore[j]}`)
      }
    }
    chunks.push(`${h.file}:${h.line}:${h.text}`)
    if (h.contextAfter?.length) {
      for (let j = 0; j < h.contextAfter.length; j++) {
        chunks.push(`${h.file}:${h.line + 1 + j}:${h.contextAfter[j]}`)
      }
    }
  }
  let out = chunks.join('\n')
  if (offset > 0 || page.length < contentHits.length) {
    out += `\n[Showing results with pagination = limit: ${headLimit}, offset: ${offset}]`
  }
  return { ok: true, output: out }
}
