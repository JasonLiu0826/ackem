/**
 * Relevant-memory prefetch — Claude Code attachments.ts prefetch spirit.
 * Never blocks the main turn; consume only when settled.
 */
import fs from 'node:fs/promises'
import type { ChatMessage } from '../../shared/types.js'
import type { ReadFileState } from '../tools/index.js'
import {
  findRelevantMemories,
  MAX_RELEVANT_MEMORIES,
  type SelectLlm
} from './findRelevantMemories.js'
import { memoryHeader } from './memoryAge.js'
import { isAutoMemoryEnabled } from './paths.js'

export const MAX_MEMORY_LINES = 200
export const MAX_MEMORY_BYTES = 4096

export const RELEVANT_MEMORIES_CONFIG = {
  MAX_SESSION_BYTES: 60 * 1024
} as const

/**
 * Marker embedded in injected user messages for session budget / dedup.
 * Format avoids raw `:` in paths (Windows drive letters break naive parsers).
 * `<!--ackem_mem <bytes> <encodeURIComponent(path)> [mtimeMs] -->`
 * mtime is optional for backward compatibility with older transcripts.
 */
export const MEMORY_SURFACED_MARKER = '<!--ackem_mem '

export type SurfacedMemory = {
  path: string
  content: string
  mtimeMs: number
  header: string
  truncated: boolean
}

export type MemoryPrefetch = {
  promise: Promise<SurfacedMemory[]>
  settledAt: number | null
  consumed: boolean
  abort: () => void
}

export type SurfacedMemoryIndex = {
  paths: Set<string>
  totalBytes: number
  /** path → mtime at last surface (0 when marker omitted mtime) */
  mtimes: Map<string, number>
}

export function memorySurfacedMarker(
  filePath: string,
  bytes: number,
  mtimeMs?: number
): string {
  const mt =
    mtimeMs != null && Number.isFinite(mtimeMs)
      ? ` ${Math.floor(mtimeMs)}`
      : ''
  return `${MEMORY_SURFACED_MARKER}${bytes} ${encodeURIComponent(filePath)}${mt} -->`
}

export function collectSurfacedMemories(
  messages: ReadonlyArray<ChatMessage>
): SurfacedMemoryIndex {
  const paths = new Set<string>()
  const mtimes = new Map<string, number>()
  let totalBytes = 0
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : ''
    if (!content.includes(MEMORY_SURFACED_MARKER)) continue
    const re = /<!--ackem_mem (\d+) (\S+)(?: (\d+))? -->/g
    let match: RegExpExecArray | null
    while ((match = re.exec(content))) {
      const bytes = Number(match[1] || 0)
      let p = match[2]!
      try {
        p = decodeURIComponent(p)
      } catch {
        /* keep raw */
      }
      paths.add(p)
      const mt = Number(match[3] || 0)
      if (Number.isFinite(mt) && mt > 0) {
        const prev = mtimes.get(p) ?? 0
        if (mt >= prev) mtimes.set(p, mt)
      } else if (!mtimes.has(p)) {
        mtimes.set(p, 0)
      }
      totalBytes += Number.isFinite(bytes) ? bytes : 0
    }
  }
  return { paths, totalBytes, mtimes }
}

export async function readMemoriesForSurfacing(
  selected: ReadonlyArray<{ path: string; mtimeMs: number }>,
  signal?: AbortSignal
): Promise<SurfacedMemory[]> {
  const results = await Promise.all(
    selected.map(async ({ path: filePath, mtimeMs }) => {
      if (signal?.aborted) return null
      try {
        const raw = await fs.readFile(filePath, 'utf8')
        const lines = raw.split(/\r?\n/)
        let content = lines.slice(0, MAX_MEMORY_LINES).join('\n')
        let truncated = lines.length > MAX_MEMORY_LINES
        if (Buffer.byteLength(content, 'utf8') > MAX_MEMORY_BYTES) {
          // Truncate by bytes while keeping valid UTF-8-ish cut
          let cut = content
          while (
            cut.length > 0 &&
            Buffer.byteLength(cut, 'utf8') > MAX_MEMORY_BYTES
          ) {
            cut = cut.slice(0, Math.floor(cut.length * 0.9))
          }
          content = cut
          truncated = true
        }
        if (truncated) {
          content +=
            `\n\n> This memory file was truncated (${MAX_MEMORY_BYTES} byte / ${MAX_MEMORY_LINES} line limit). ` +
            `Use read_file to view the complete file at: ${filePath}`
        }
        return {
          path: filePath,
          content,
          mtimeMs,
          header: memoryHeader(filePath, mtimeMs),
          truncated
        }
      } catch {
        return null
      }
    })
  )
  return results.filter((r): r is SurfacedMemory => r !== null)
}

export function formatRelevantMemoriesMessage(
  memories: SurfacedMemory[]
): string {
  if (!memories.length) return ''
  const blocks = memories.map((m) => {
    const marker = memorySurfacedMarker(m.path, m.content.length, m.mtimeMs)
    return `${marker}\n${m.header}\n${m.content}`
  })
  return [
    '<system-reminder>',
    'Relevant memories for this turn (selected by relevance; verify before treating as fact):',
    '',
    ...blocks,
    '</system-reminder>'
  ].join('\n')
}

export function collectRecentSuccessfulTools(
  messages: ReadonlyArray<ChatMessage>
): string[] {
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user' && typeof messages[i]!.content === 'string') {
        const c = messages[i]!.content as string
        if (!c.includes(MEMORY_SURFACED_MARKER) && !c.startsWith('<system-reminder>')) {
          return i
        }
      }
    }
    return -1
  })()
  if (lastUserIdx < 0) return []

  const ok = new Set<string>()
  const failed = new Set<string>()
  const idToName = new Map<string, string>()

  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    const m = messages[i]!
    if (m.role === 'assistant' && m.tool_calls?.length) {
      for (const c of m.tool_calls) {
        idToName.set(c.id, c.function.name)
      }
    }
    if (m.role === 'tool' && m.tool_call_id) {
      const name = idToName.get(m.tool_call_id) || m.name
      if (!name) continue
      const body = String(m.content ?? '')
      const isErr =
        /^(Error|Exit code [1-9]|User denied|Hook blocked|Permission)/i.test(
          body.trim()
        ) || body.includes('Exit code 1')
      if (isErr) {
        failed.add(name)
        ok.delete(name)
      } else if (!failed.has(name)) {
        ok.add(name)
      }
    }
  }
  return [...ok]
}

/**
 * Start non-blocking relevance prefetch for the current user turn.
 */
export function startRelevantMemoryPrefetch(opts: {
  query: string
  memoryDir: string | null | undefined
  messages: ReadonlyArray<ChatMessage>
  llm?: SelectLlm
  signal?: AbortSignal
  autoMemoryEnabled?: boolean
  readFileState?: ReadFileState
}): MemoryPrefetch | undefined {
  if (process.env.ACKEM_DISABLE_MEMORY_PREFETCH === '1') return undefined
  if (!isAutoMemoryEnabled({ autoMemoryEnabled: opts.autoMemoryEnabled })) {
    return undefined
  }
  if (!opts.memoryDir?.trim()) return undefined

  const q = opts.query.trim()
  // Single-word prompts lack context for meaningful selection
  if (!q || !/\s/.test(q)) return undefined

  const surfaced = collectSurfacedMemories(opts.messages)
  if (surfaced.totalBytes >= RELEVANT_MEMORIES_CONFIG.MAX_SESSION_BYTES) {
    return undefined
  }

  const ctrl = new AbortController()
  const onParent = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onParent, { once: true })

  const promise = (async (): Promise<SurfacedMemory[]> => {
    try {
      const selected = await findRelevantMemories({
        query: q,
        memoryDir: opts.memoryDir!,
        signal: ctrl.signal,
        recentTools: collectRecentSuccessfulTools(opts.messages),
        alreadySurfaced: surfaced.paths,
        surfacedMtimes: surfaced.mtimes,
        llm: opts.llm
      })
      const filtered = selected
        .filter((m) => {
          // Belt-and-suspenders: skip unchanged re-hits; allow mtime-newer.
          const prev = surfaced.mtimes.get(m.path)
          if (
            surfaced.paths.has(m.path) &&
            (prev == null || prev <= 0 || m.mtimeMs <= prev)
          ) {
            return false
          }
          const read = opts.readFileState?.get(m.path)
          // Allow re-inject when file is newer than last read/seed.
          if (read && m.mtimeMs <= read.mtimeMs) return false
          return true
        })
        .slice(0, MAX_RELEVANT_MEMORIES)
      return await readMemoriesForSurfacing(filtered, ctrl.signal)
    } catch {
      return []
    } finally {
      opts.signal?.removeEventListener('abort', onParent)
    }
  })()

  const handle: MemoryPrefetch = {
    promise,
    settledAt: null,
    consumed: false,
    abort: () => ctrl.abort()
  }
  void promise.finally(() => {
    handle.settledAt = Date.now()
  })
  return handle
}

/**
 * Consume-if-ready (zero wait). Returns null if not settled or already consumed.
 */
export async function tryConsumeMemoryPrefetch(
  handle: MemoryPrefetch | undefined
): Promise<SurfacedMemory[] | null> {
  if (!handle || handle.consumed || handle.settledAt === null) return null
  handle.consumed = true
  try {
    return await handle.promise
  } catch {
    return []
  }
}

/**
 * CC filterDuplicateMemoryAttachments spirit — drop already-read paths and
 * seed readFileState so tools treat injected memories as already read.
 * Files newer than the seeded/read mtime may re-inject (cross-turn freshness).
 */
export function filterAndSeedSurfacedMemories(
  memories: SurfacedMemory[],
  readFileState?: ReadFileState
): SurfacedMemory[] {
  const filtered = memories.filter((m) => {
    const prev = readFileState?.get(m.path)
    if (!prev) return true
    return m.mtimeMs > prev.mtimeMs
  })
  for (const m of filtered) {
    readFileState?.remember(m.path, m.mtimeMs, !m.truncated)
  }
  return filtered
}
