import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { FileFinding } from '../../../shared/investigation'

const SEARCH_LIMIT = 200
const MAX_DEPTH = 5

export function parseExtensionsFromQuery(query: string): string[] {
  const fromDot = query.match(/\.(pdf|docx?|pptx?|xlsx?|csv|md|txt|log|json)/gi)
  if (fromDot?.length) {
    return [...new Set(fromDot.map((e) => e.toLowerCase()))]
  }
  if (/pdf/i.test(query)) return ['.pdf']
  if (/word|doc/i.test(query)) return ['.doc', '.docx']
  if (/ppt|powerpoint/i.test(query)) return ['.ppt', '.pptx']
  if (/excel|xlsx|表格/i.test(query)) return ['.xlsx', '.csv']
  if (/markdown|md/i.test(query)) return ['.md']
  return ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xlsx', '.txt', '.md', '.csv']
}

export function searchFilesByExtensions(
  root: string,
  extensions: string[],
  source: FileFinding['source']
): FileFinding[] {
  if (!root || !existsSync(root)) return []
  const extSet = new Set(extensions.map((e) => e.toLowerCase()))
  const hits: FileFinding[] = []
  const seen = new Set<string>()

  const walk = (dir: string, depth: number): void => {
    if (hits.length >= SEARCH_LIMIT || depth > MAX_DEPTH) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (hits.length >= SEARCH_LIMIT) break
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        walk(full, depth + 1)
        continue
      }
      if (!e.isFile()) continue
      const ext = extname(e.name).toLowerCase()
      if (!extSet.has(ext)) continue
      const key = full.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      try {
        statSync(full)
      } catch {
        continue
      }
      hits.push({
        displayName: e.name,
        path: full,
        source,
        confidence: 'high'
      })
    }
  }

  walk(root, 0)
  return hits.sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'))
}

export function mergeFileFindings(files: FileFinding[]): FileFinding[] {
  const byPath = new Map<string, FileFinding>()
  for (const f of files) {
    byPath.set(f.path.toLowerCase(), f)
  }
  return [...byPath.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'))
}
