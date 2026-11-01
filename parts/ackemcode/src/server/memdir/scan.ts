/**
 * Scan memory topic files + parse frontmatter — Claude Code memdir/memoryScan.ts spirit.
 */
import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseMemoryType, type MemoryType } from './memoryTypes.js'
import { ENTRYPOINT_NAME } from './paths.js'

export type MemoryHeader = {
  filename: string
  filePath: string
  mtimeMs: number
  name: string
  description: string
  type: MemoryType | undefined
}

export const MAX_MEMORY_FILES = 200
const FRONTMATTER_MAX_LINES = 30

function parseFrontmatter(
  content: string
): { name?: string; description?: string; type?: MemoryType } {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = content.slice(3, end).replace(/^\r?\n/, '')
  const out: { name?: string; description?: string; type?: MemoryType } = {}
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const val = m[2]!.trim().replace(/^["']|["']$/g, '')
    if (key === 'name') out.name = val
    else if (key === 'description') out.description = val
    else if (key === 'type') out.type = parseMemoryType(val)
  }
  return out
}

async function listMarkdownRelative(
  memoryDir: string
): Promise<string[]> {
  const out: string[] = []
  async function walk(rel: string): Promise<void> {
    const abs = rel ? path.join(memoryDir, rel) : memoryDir
    let entries: Dirent[]
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) {
        await walk(childRel)
        continue
      }
      if (!e.isFile() || !e.name.endsWith('.md')) continue
      if (e.name === ENTRYPOINT_NAME) continue
      out.push(childRel.split(path.sep).join('/'))
    }
  }
  await walk('')
  return out
}

/**
 * Scan memdir for topic `.md` (recursive), newest-first, capped at MAX_MEMORY_FILES.
 */
export async function scanMemoryFiles(
  memoryDir: string,
  signal?: AbortSignal
): Promise<MemoryHeader[]> {
  if (signal?.aborted) return []
  let relatives: string[]
  try {
    relatives = await listMarkdownRelative(memoryDir)
  } catch {
    return []
  }

  const headerResults = await Promise.allSettled(
    relatives.map(async (relativePath): Promise<MemoryHeader> => {
      if (signal?.aborted) throw new Error('aborted')
      const filePath = path.join(memoryDir, relativePath)
      const st = await fs.stat(filePath)
      const raw = await fs.readFile(filePath, 'utf8')
      const head = raw.split(/\r?\n/).slice(0, FRONTMATTER_MAX_LINES).join('\n')
      const fm = parseFrontmatter(head)
      return {
        filename: relativePath,
        filePath,
        mtimeMs: st.mtimeMs,
        name: fm.name || path.basename(relativePath, '.md'),
        description: fm.description || '',
        type: fm.type
      }
    })
  )

  return headerResults
    .filter(
      (r): r is PromiseFulfilledResult<MemoryHeader> => r.status === 'fulfilled'
    )
    .map((r) => r.value)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_MEMORY_FILES)
}

/** One line per file for selector / extract prompts. */
export function formatMemoryManifest(memories: MemoryHeader[]): string {
  return memories
    .map((m) => {
      const tag = m.type ? `[${m.type}] ` : ''
      const ts = new Date(m.mtimeMs).toISOString()
      return m.description
        ? `- ${tag}${m.filename} (${ts}): ${m.description}`
        : `- ${tag}${m.filename} (${ts})`
    })
    .join('\n')
}

export function buildMemoryIndexMarkdown(headers: MemoryHeader[]): string {
  if (headers.length === 0) {
    return [
      '# Memory Index',
      '',
      '_No topic memories yet. When you save a memory, add a one-line link here._',
      ''
    ].join('\n')
  }
  const lines = [
    '# Memory Index',
    '',
    '<!-- Keep under 200 lines / 25KB. Link topic files; do not dump full content. -->',
    ''
  ]
  for (const h of headers) {
    const label = h.description || h.name
    const type = h.type ? ` (${h.type})` : ''
    lines.push(`- [${h.name}](${h.filename})${type}: ${label}`)
  }
  lines.push('')
  return lines.join('\n')
}
