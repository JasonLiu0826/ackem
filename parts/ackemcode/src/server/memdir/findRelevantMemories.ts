/**
 * Relevance selection over memory headers — Claude Code findRelevantMemories spirit.
 * LLM JSON select when API available; heuristic fallback for offline/smoke.
 */
import path from 'node:path'
import { chatCompletion } from '../agent/llm.js'
import type { EffortLevel } from '../../shared/types.js'
import { memoryAgeDays } from './memoryAge.js'
import {
  formatMemoryManifest,
  scanMemoryFiles,
  type MemoryHeader
} from './scan.js'

export type RelevantMemory = {
  path: string
  mtimeMs: number
  filename: string
}

export const MAX_RELEVANT_MEMORIES = 5

const SELECT_SYSTEM = `You are selecting memories that will be useful while processing a user's coding query. You will be given the user's query and a list of available memory files with filenames and descriptions.

Return JSON only: {"selected_memories":["filename",...]} with up to 5 filenames that will clearly be useful.
- Only include memories you are certain will help based on name and description.
- If unsure, omit. Empty list is fine.
- If recently-used tools are listed, do NOT select usage/API docs for those tools. DO still select warnings, gotchas, or known issues about them.`

export type SelectLlm = {
  apiBaseUrl: string
  apiKey: string
  model: string
  effort?: EffortLevel
}

export type MemoryRelevanceScore = {
  filename: string
  score: number
  mtimeMs: number
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((t) => t.length >= 2)
    .flatMap((t) => {
      // light stemming so install≈installs, package≈packages
      if (t.endsWith('ies') && t.length > 4) return [t, t.slice(0, -3) + 'y']
      if (t.endsWith('es') && t.length > 4) return [t, t.slice(0, -2)]
      if (t.endsWith('s') && t.length > 3) return [t, t.slice(0, -1)]
      return [t]
    })
}

/**
 * True when this path was already injected and the on-disk mtime has not
 * advanced — updated topic files may re-enter the top-k budget.
 */
export function isMemoryEffectivelySurfaced(
  header: Pick<MemoryHeader, 'filePath' | 'filename' | 'mtimeMs'>,
  alreadySurfaced: ReadonlySet<string> = new Set(),
  surfacedMtimes?: ReadonlyMap<string, number>
): boolean {
  const hit =
    alreadySurfaced.has(header.filePath) ||
    alreadySurfaced.has(header.filename)
  if (!hit) return false
  const prev =
    surfacedMtimes?.get(header.filePath) ??
    surfacedMtimes?.get(header.filename)
  // Legacy markers without mtime: treat as still surfaced.
  if (prev == null || prev <= 0) return true
  return header.mtimeMs <= prev
}

/**
 * Score memories for heuristic selection (exported for smoke / tuning).
 * Recency + basename overlap improve offline relevance vs pure bag-of-words.
 */
export function scoreRelevantMemories(
  query: string,
  memories: MemoryHeader[],
  recentTools: readonly string[] = []
): MemoryRelevanceScore[] {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return []
  const toolSet = new Set(recentTools.map((t) => t.toLowerCase()))

  return memories.map((m) => {
    const blob = `${m.filename} ${m.name} ${m.description} ${m.type ?? ''}`
    const tokens = tokenize(blob)
    let score = 0
    for (const t of tokens) {
      if (qTokens.has(t)) score += 2
    }
    // Basename / slug tokens weigh more (path-aware relevance).
    const base = path.basename(m.filename, '.md')
    for (const t of tokenize(base)) {
      if (qTokens.has(t)) score += 3
    }
    // Soft boost for project/feedback when query mentions 约定/prefer/style
    if (
      (m.type === 'project' || m.type === 'feedback') &&
      /约定|prefer|style|convention|remember|记住/i.test(query)
    ) {
      score += 1
    }
    // Recency only ranks already-relevant hits (never creates relevance alone).
    if (score > 0) {
      const age = memoryAgeDays(m.mtimeMs)
      if (age <= 1) score += 2
      else if (age <= 7) score += 1
    }
    // Suppress reference/docs that look like tool manuals when tool is active
    const looksLikeToolDoc =
      m.type === 'reference' &&
      tokens.some((t) => toolSet.has(t)) &&
      !/warn|gotcha|issue|pitfall|注意|坑/i.test(blob)
    if (looksLikeToolDoc) score -= 3
    return { filename: m.filename, score, mtimeMs: m.mtimeMs }
  })
}

/**
 * Keyword overlap scorer — used when LLM unavailable or forced by env.
 */
export function selectRelevantMemoriesHeuristic(
  query: string,
  memories: MemoryHeader[],
  recentTools: readonly string[] = []
): string[] {
  return scoreRelevantMemories(query, memories, recentTools)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_RELEVANT_MEMORIES)
    .map((s) => s.filename)
}

async function selectRelevantMemoriesLlm(
  query: string,
  memories: MemoryHeader[],
  recentTools: readonly string[],
  llm: SelectLlm,
  signal?: AbortSignal
): Promise<string[] | null> {
  if (!llm.apiKey?.trim()) return null
  if (process.env.ACKEM_MEMORY_PREFETCH_HEURISTIC === '1') return null

  const valid = new Set(memories.map((m) => m.filename))
  const toolsSection =
    recentTools.length > 0
      ? `\n\nRecently used tools: ${recentTools.join(', ')}`
      : ''
  const user = `Query: ${query}\n\nAvailable memories:\n${formatMemoryManifest(memories)}${toolsSection}`

  try {
    const { message: msg } = await chatCompletion({
      apiBaseUrl: llm.apiBaseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      effort: llm.effort ?? 'low',
      messages: [
        { role: 'system', content: SELECT_SYSTEM },
        { role: 'user', content: user }
      ],
      tools: [],
      signal
    })
    const text = String(msg.content ?? '')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0]) as {
      selected_memories?: unknown
    }
    const list = Array.isArray(parsed.selected_memories)
      ? parsed.selected_memories.filter((x): x is string => typeof x === 'string')
      : []
    return list.filter((f) => valid.has(f)).slice(0, MAX_RELEVANT_MEMORIES)
  } catch {
    if (signal?.aborted) return []
    return null
  }
}

/**
 * Find up to 5 memory files relevant to `query`.
 * Excludes MEMORY.md (via scan). Filters effectively-surfaced paths before
 * selection (mtime-aware: updated files may re-compete for the 5-slot budget).
 */
export async function findRelevantMemories(opts: {
  query: string
  memoryDir: string
  signal?: AbortSignal
  recentTools?: readonly string[]
  alreadySurfaced?: ReadonlySet<string>
  /** path/filename → mtime at last surface; omit/0 = legacy path-only block */
  surfacedMtimes?: ReadonlyMap<string, number>
  llm?: SelectLlm
}): Promise<RelevantMemory[]> {
  const already = opts.alreadySurfaced ?? new Set<string>()
  const recentTools = opts.recentTools ?? []
  const memories = (await scanMemoryFiles(opts.memoryDir, opts.signal)).filter(
    (m) => !isMemoryEffectivelySurfaced(m, already, opts.surfacedMtimes)
  )
  if (memories.length === 0) return []

  let selected =
    (await selectRelevantMemoriesLlm(
      opts.query,
      memories,
      recentTools,
      opts.llm ?? { apiBaseUrl: '', apiKey: '', model: '' },
      opts.signal
    )) ?? selectRelevantMemoriesHeuristic(opts.query, memories, recentTools)

  const byFilename = new Map(memories.map((m) => [m.filename, m]))
  return selected
    .map((f) => byFilename.get(f))
    .filter((m): m is MemoryHeader => m !== undefined)
    .slice(0, MAX_RELEVANT_MEMORIES)
    .map((m) => ({
      path: m.filePath,
      mtimeMs: m.mtimeMs,
      filename: m.filename
    }))
}
