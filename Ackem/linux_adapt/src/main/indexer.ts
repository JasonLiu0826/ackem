import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import type { AppSettings } from './settings'
import { resolveDataRoot } from './paths'

export type ChunkRecord = {
  id: string
  relPath: string
  start: number
  end: number
  text: string
  mtimeMs: number
}

export type IndexSnapshot = {
  version: 1
  builtAt: string
  dataRoot: string
  chunks: ChunkRecord[]
  /** C5: 预计算的文档频率表，避免每次搜索重建 */
  docFreq?: Record<string, number>
}

const INDEX_VERSION = 1 as const
const MAX_CHUNK_CHARS = 900
const DIARY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/i

function hashId(rel: string, start: number, end: number): string {
  return createHash('sha256').update(`${rel}:${start}:${end}`).digest('hex').slice(0, 16)
}

function listFilesRecursive(dir: string, base: string, acc: string[]): void {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) {
      listFilesRecursive(full, base, acc)
    } else {
      const ext = extname(name.name).toLowerCase()
      if (ext === '.md' || ext === '.txt') {
        acc.push(relative(base, full).replace(/\\/g, '/'))
      }
    }
  }
}

function splitIntoChunks(text: string): string[] {
  const parts = text.split(/\n{2,}/)
  const out: string[] = []
  let buf = ''
  for (const p of parts) {
    const piece = p.trim()
    if (!piece) continue
    if ((buf + '\n\n' + piece).length > MAX_CHUNK_CHARS && buf) {
      out.push(buf)
      buf = piece
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece
    }
  }
  if (buf) out.push(buf)
  if (out.length === 0 && text.trim()) out.push(text.trim().slice(0, MAX_CHUNK_CHARS))
  const merged: string[] = []
  for (const c of out) {
    if (c.length <= MAX_CHUNK_CHARS) merged.push(c)
    else {
      for (let i = 0; i < c.length; i += MAX_CHUNK_CHARS) {
        merged.push(c.slice(i, i + MAX_CHUNK_CHARS))
      }
    }
  }
  return merged
}

function isDiaryRecent(relPath: string, days: number): boolean {
  const m = basename(relPath).match(DIARY_FILE)
  if (!m) return true
  const d = new Date(m[1] + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return true
  const cutoff = Date.now() - days * 86400_000
  return d.getTime() >= cutoff
}

function collectIndexedRelPaths(dataRoot: string, settings: AppSettings): string[] {
  const roots = [
    join(dataRoot, 'memory'),
    join(dataRoot, 'preferences'),
    join(dataRoot, 'portrait'),
    join(dataRoot, 'diary'),
    join(dataRoot, 'companion')
  ]
  const files: string[] = []
  for (const r of roots) {
    listFilesRecursive(r, dataRoot, files)
  }
  return files.filter((rel) => {
    if (!rel.startsWith('diary/')) return true
    return isDiaryRecent(rel, settings.tierBDiaryDays)
  })
}

export function buildIndex(settings: AppSettings): IndexSnapshot {
  const dataRoot = resolveDataRoot(settings)
  const rels = collectIndexedRelPaths(dataRoot, settings)
  const chunks: ChunkRecord[] = []
  for (const rel of rels) {
    const abs = join(dataRoot, rel)
    try {
      const st = statSync(abs)
      const raw = readFileSync(abs, 'utf-8')
      const pieces = splitIntoChunks(raw)
      pieces.forEach((text, i) => {
        const start = i * (MAX_CHUNK_CHARS + 1)
        const end = start + text.length
        chunks.push({
          id: hashId(rel, start, end),
          relPath: rel,
          start,
          end,
          text,
          mtimeMs: st.mtimeMs
        })
      })
    } catch {
      /* skip */
    }
  }
  // C5: 预计算文档频率，避免每次 searchChunks 重建
  const df = docFreq(chunks)
  const docFreqMap: Record<string, number> = {}
  for (const [k, v] of df) { docFreqMap[k] = v }

  return {
    version: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    dataRoot,
    chunks,
    docFreq: docFreqMap
  }
}

export function persistDerivedIndex(dataRoot: string, snap: IndexSnapshot): void {
  const dir = join(dataRoot, '_derived')
  writeFileSync(join(dir, 'chunk-index.v1.json'), JSON.stringify(snap, null, 2), 'utf-8')
}

export function tryLoadDerivedIndex(dataRoot: string): IndexSnapshot | null {
  const p = join(dataRoot, '_derived', 'chunk-index.v1.json')
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8')) as IndexSnapshot
    if (j.version !== INDEX_VERSION || j.dataRoot !== dataRoot) return null
    return j
  } catch {
    return null
  }
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length >= 2)
}

function docFreq(chunks: ChunkRecord[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const c of chunks) {
    const terms = new Set(tokenize(c.text))
    for (const t of terms) {
      df.set(t, (df.get(t) ?? 0) + 1)
    }
  }
  return df
}

export function searchChunks(
  snap: IndexSnapshot,
  query: string,
  limit: number
): { chunk: ChunkRecord; score: number }[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []
  // C5: 使用预计算的 docFreq，仅在未缓存时回退重建
  const df: Map<string, number> = snap.docFreq
    ? new Map(Object.entries(snap.docFreq))
    : docFreq(snap.chunks)
  const N = Math.max(1, snap.chunks.length)
  const scores: { chunk: ChunkRecord; score: number }[] = []
  for (const c of snap.chunks) {
    const tokens = tokenize(c.text)
    if (tokens.length === 0) continue
    const tf = new Map<string, number>()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1)
    }
    let s = 0
    for (const term of terms) {
      const f = tf.get(term) ?? 0
      if (f === 0) continue
      const dfi = df.get(term) ?? 1
      const idf = Math.log((1 + N) / (1 + dfi)) + 1
      s += (1 + Math.log(f)) * idf
    }
    if (s > 0) scores.push({ chunk: c, score: s })
  }
  scores.sort((a, b) => b.score - a.score)
  return scores.slice(0, limit)
}
