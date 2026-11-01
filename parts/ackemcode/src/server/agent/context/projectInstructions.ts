import fs from 'node:fs/promises'
import path from 'node:path'
import {
  MAX_INSTRUCTION_FILE_CHARS,
  MAX_TOTAL_INSTRUCTIONS_CHARS
} from './constants.js'

export type InstructionSource = {
  relPath: string
  absPath: string
  content: string
  truncated: boolean
}

const TEXT_INCLUDE_EXT = new Set([
  '.md',
  '.txt',
  '.markdown',
  '.rst',
  '.json',
  '.yml',
  '.yaml',
  '.toml'
])

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return {
    text:
      text.slice(0, max) +
      `\n\n…[truncated at ${max} chars — open the file with read_file if you need more]`,
    truncated: true
  }
}

async function tryRead(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
}

async function findGitRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start)
  for (let i = 0; i < 40; i++) {
    try {
      await fs.access(path.join(dir, '.git'))
      return dir
    } catch {
      /* continue */
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Walk cwd → git root (inclusive). Without a .git root: **cwd only**
 * (avoid sucking in unrelated parent CLAUDE.md outside the project).
 */
export async function collectInstructionDirs(cwd: string): Promise<string[]> {
  const start = path.resolve(cwd)
  const gitRoot = await findGitRoot(start)
  if (!gitRoot) return [start]
  const upward: string[] = []
  let dir = start
  for (let i = 0; i < 40; i++) {
    upward.push(dir)
    if (path.resolve(dir) === path.resolve(gitRoot)) break
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return upward.reverse()
}

/**
 * Expand @include on non-code leaf text (CC claudemd spirit).
 */
export async function expandIncludes(
  content: string,
  baseDir: string,
  processed: Set<string>,
  budget: { remaining: number }
): Promise<string> {
  const parts: Array<{ kind: 'code' | 'text'; text: string }> = []
  const fenceRe = /```[\s\S]*?```|`[^`\n]+`/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(content))) {
    if (m.index > last) parts.push({ kind: 'text', text: content.slice(last, m.index) })
    parts.push({ kind: 'code', text: m[0]! })
    last = m.index + m[0]!.length
  }
  if (last < content.length) parts.push({ kind: 'text', text: content.slice(last) })

  const includeRe = /(?:^|\s)@((?:[^\s\\]|\\ )+)/g
  const out: string[] = []

  for (const part of parts) {
    if (part.kind === 'code') {
      out.push(part.text)
      continue
    }
    const text = part.text
    const matches = [...text.matchAll(includeRe)]
    if (!matches.length) {
      out.push(text)
      continue
    }
    let cursor = 0
    let rebuilt = ''
    for (const match of matches) {
      const full = match[0]!
      const rawPath = match[1]!.replace(/\\ /g, ' ')
      const idx = match.index ?? 0
      rebuilt += text.slice(cursor, idx)
      rebuilt += full // keep original @ref in place
      cursor = idx + full.length

      let target = rawPath
      if (target.startsWith('~/') || target.startsWith('~\\')) {
        const home = process.env.HOME || process.env.USERPROFILE || ''
        target = path.join(home, target.slice(2))
      } else if (!path.isAbsolute(target)) {
        target = path.resolve(baseDir, target)
      }
      target = path.normalize(target)
      const ext = path.extname(target).toLowerCase()
      if (ext && !TEXT_INCLUDE_EXT.has(ext)) continue
      if (processed.has(target)) continue
      if (budget.remaining <= 0) continue
      processed.add(target)
      const included = await tryRead(target)
      if (included == null) continue
      const take = Math.min(included.length, budget.remaining, MAX_INSTRUCTION_FILE_CHARS)
      const slice = included.slice(0, take)
      budget.remaining -= slice.length
      const nested = await expandIncludes(slice, path.dirname(target), processed, budget)
      rebuilt += `\n\n<!-- included: ${rawPath} -->\n${nested}\n`
    }
    rebuilt += text.slice(cursor)
    out.push(rebuilt)
  }

  return out.join('')
}

async function loadFilesInDir(
  dir: string,
  displayPrefix: string
): Promise<Array<{ rel: string; abs: string; raw: string }>> {
  const names = [
    'AGENTS.md',
    'CLAUDE.md',
    path.join('.claude', 'CLAUDE.md'),
    'CLAUDE.local.md'
  ]
  const out: Array<{ rel: string; abs: string; raw: string }> = []
  for (const name of names) {
    const abs = path.join(dir, name)
    const raw = await tryRead(abs)
    if (raw == null || !raw.trim()) continue
    const base = name.replace(/\\/g, '/')
    const rel = displayPrefix ? `${displayPrefix}/${base}` : base
    out.push({ rel, abs, raw: raw.trim() })
  }
  try {
    const rulesDir = path.join(dir, '.claude', 'rules')
    const entries = await fs.readdir(rulesDir)
    for (const e of entries.sort()) {
      if (!e.endsWith('.md')) continue
      const abs = path.join(rulesDir, e)
      const raw = await tryRead(abs)
      if (raw == null || !raw.trim()) continue
      const base = `.claude/rules/${e}`
      const rel = displayPrefix ? `${displayPrefix}/${base}` : base
      out.push({ rel, abs, raw: raw.trim() })
    }
  } catch {
    /* no rules */
  }
  return out
}

/**
 * Load project instructions — upward walk + @include (CC claudemd spirit).
 */
export async function loadProjectInstructions(cwd: string): Promise<{
  sources: InstructionSource[]
  block: string | null
}> {
  const sources: InstructionSource[] = []
  let total = 0
  const processedIncludes = new Set<string>()
  const root = path.resolve(cwd)

  const pushSource = async (rel: string, abs: string, raw: string) => {
    if (total >= MAX_TOTAL_INSTRUCTIONS_CHARS) return
    const fileBudget = Math.min(
      MAX_INSTRUCTION_FILE_CHARS,
      MAX_TOTAL_INSTRUCTIONS_CHARS - total
    )
    const budget = { remaining: fileBudget }
    processedIncludes.add(path.normalize(abs))
    const expanded = await expandIncludes(raw, path.dirname(abs), processedIncludes, budget)
    const { text, truncated } = truncate(expanded, fileBudget)
    sources.push({ relPath: rel, absPath: abs, content: text, truncated })
    total += text.length
  }

  const home = process.env.HOME || process.env.USERPROFILE
  if (home) {
    const userClaude = path.join(home, '.claude', 'CLAUDE.md')
    const raw = await tryRead(userClaude)
    if (raw?.trim()) await pushSource('~/.claude/CLAUDE.md', userClaude, raw.trim())
  }

  const dirs = await collectInstructionDirs(cwd)
  for (const dir of dirs) {
    if (total >= MAX_TOTAL_INSTRUCTIONS_CHARS) break
    const displayPrefix =
      path.resolve(dir) === root ? '' : path.relative(root, dir).replace(/\\/g, '/')
    const files = await loadFilesInDir(dir, displayPrefix)
    for (const f of files) {
      if (total >= MAX_TOTAL_INSTRUCTIONS_CHARS) break
      await pushSource(f.rel, f.abs, f.raw)
    }
  }

  if (!sources.length) return { sources: [], block: null }

  const parts = [
    'Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.',
    ...sources.map(
      (s) => `### ${s.relPath}${s.truncated ? ' (truncated)' : ''}\n\n${s.content}`
    )
  ]
  return { sources, block: parts.join('\n\n') }
}
