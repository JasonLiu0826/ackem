/**
 * Persist large tool results + cache-stable re-apply —
 * Claude Code utils/toolResultStorage.ts spirit (OpenAI ChatMessage shape).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'

export const TOOL_RESULTS_SUBDIR = 'tool-results'
export const PERSISTED_OUTPUT_TAG = '<persisted-output>'
export const PERSISTED_OUTPUT_CLOSING_TAG = '</persisted-output>'
/** Stable cleared text — byte-identical across turns (cache prefix). */
export const TOOL_RESULT_CLEARED_MESSAGE = '[Old tool result content cleared]'

export const PREVIEW_SIZE_BYTES = 2000
/** Default char threshold before persist-to-disk (CC DEFAULT_MAX_RESULT_SIZE spirit). */
export const DEFAULT_PERSIST_THRESHOLD_CHARS = 50_000
/** Soft per-message aggregate of tool result chars before forcing more persists. */
export const DEFAULT_PER_MESSAGE_BUDGET_CHARS = 120_000

export type ContentReplacementState = {
  seenIds: Set<string>
  replacements: Map<string, string>
}

export function createContentReplacementState(): ContentReplacementState {
  return { seenIds: new Set(), replacements: new Map() }
}

export function cloneContentReplacementState(
  source: ContentReplacementState
): ContentReplacementState {
  return {
    seenIds: new Set(source.seenIds),
    replacements: new Map(source.replacements)
  }
}

function resolvePersistThreshold(): number {
  const env = process.env.ACKEM_TOOL_RESULT_PERSIST_CHARS
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return DEFAULT_PERSIST_THRESHOLD_CHARS
}

function resolveBudgetLimit(): number {
  const env = process.env.ACKEM_TOOL_RESULT_BUDGET_CHARS
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return DEFAULT_PER_MESSAGE_BUDGET_CHARS
}

function toolResultsBaseDir(): string {
  return (
    process.env.ACKEM_TOOL_RESULTS_DIR?.trim() ||
    path.join(os.tmpdir(), 'ackemcode-tool-results')
  )
}

function toolResultsProjectKey(cwd: string): string {
  return path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 80)
}

/** Project-scoped root — all session subdirs live under here. */
export function getToolResultsProjectRoot(cwd: string): string {
  return path.join(toolResultsBaseDir(), toolResultsProjectKey(cwd))
}

export function getToolResultsRoot(cwd: string, sessionId?: string): string {
  const key = (sessionId || 'session').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  return path.join(getToolResultsProjectRoot(cwd), key, TOOL_RESULTS_SUBDIR)
}

export function generatePreview(
  content: string,
  maxBytes: number
): { preview: string; hasMore: boolean } {
  if (content.length <= maxBytes) {
    return { preview: content, hasMore: false }
  }
  const truncated = content.slice(0, maxBytes)
  const lastNewline = truncated.lastIndexOf('\n')
  const cutPoint = lastNewline > maxBytes * 0.5 ? lastNewline : maxBytes
  return { preview: content.slice(0, cutPoint), hasMore: true }
}

export function buildLargeToolResultMessage(opts: {
  filepath: string
  originalSize: number
  preview: string
  hasMore: boolean
}): string {
  const sizeKb = (opts.originalSize / 1024).toFixed(1)
  let message = `${PERSISTED_OUTPUT_TAG}\n`
  message += `Output too large (${sizeKb} KB). Full output saved to: ${opts.filepath}\n\n`
  message += `Preview (first ~${PREVIEW_SIZE_BYTES} bytes):\n`
  message += opts.preview
  message += opts.hasMore ? '\n...\n' : '\n'
  message += PERSISTED_OUTPUT_CLOSING_TAG
  return message
}

export function isContentAlreadyCompacted(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.startsWith(PERSISTED_OUTPUT_TAG)
}

/** G-01: path embedded in persisted-output preview block. */
export function extractPersistedOutputFilePath(
  content: string | null | undefined
): string | null {
  if (!content || !content.includes(PERSISTED_OUTPUT_TAG)) return null
  const m = content.match(
    /Full output saved to:\s*([^\n\r]+)/i
  )
  return m?.[1]?.trim() || null
}

export function isToolResultPersistPath(
  absPath: string,
  cwd: string,
  sessionId?: string
): boolean {
  const abs = path.resolve(absPath)
  if (sessionId) {
    const root = path.resolve(getToolResultsRoot(cwd, sessionId))
    return abs === root || abs.startsWith(root + path.sep)
  }
  const prefix = getToolResultsProjectRoot(cwd)
  const underProject =
    abs === prefix || abs.startsWith(prefix + path.sep)
  return (
    underProject &&
    abs.split(path.sep).includes(TOOL_RESULTS_SUBDIR)
  )
}

async function persistToolResult(
  content: string,
  toolUseId: string,
  cwd: string,
  sessionId?: string
): Promise<{ filepath: string; originalSize: number; preview: string; hasMore: boolean } | { error: string }> {
  const dir = getToolResultsRoot(cwd, sessionId)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  const safeId = toolUseId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
  const filepath = path.join(dir, `${safeId}.txt`)
  try {
    await fs.writeFile(filepath, content, { flag: 'wx' }).catch(async (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return
      throw err
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  const { preview, hasMore } = generatePreview(content, PREVIEW_SIZE_BYTES)
  return {
    filepath,
    originalSize: content.length,
    preview,
    hasMore
  }
}

function buildToolNameMap(messages: ChatMessage[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue
    for (const c of m.tool_calls) {
      map.set(c.id, c.function.name)
    }
  }
  return map
}

/** Tools that should not be persisted (self-bounded readers). */
const SKIP_PERSIST = new Set(['read_file'])

/**
 * Enforce per-tool persist + cache-stable re-apply for `role:tool` messages.
 */
export async function enforceToolResultBudget(
  messages: ChatMessage[],
  state: ContentReplacementState,
  opts: { cwd: string; sessionId?: string } 
): Promise<{ messages: ChatMessage[]; newlyReplaced: number; reapplied: number }> {
  const threshold = resolvePersistThreshold()
  const budget = resolveBudgetLimit()
  const nameById = buildToolNameMap(messages)

  const replacementMap = new Map<string, string>()
  let newlyReplaced = 0
  let reapplied = 0

  // Collect tool messages in order
  type Cand = { index: number; id: string; content: string; size: number }
  const candidates: Cand[] = []
  messages.forEach((m, index) => {
    if (m.role !== 'tool' || !m.tool_call_id) return
    const content = flattenMessageContent(m.content)
    if (!content || isContentAlreadyCompacted(content)) return
    if (content === TOOL_RESULT_CLEARED_MESSAGE) return
    candidates.push({
      index,
      id: m.tool_call_id,
      content,
      size: content.length
    })
  })

  // Re-apply prior decisions (no I/O)
  for (const c of candidates) {
    const prev = state.replacements.get(c.id)
    if (prev !== undefined) {
      replacementMap.set(c.id, prev)
      reapplied += 1
    }
  }

  // Fresh candidates: never seen
  const fresh = candidates.filter(
    (c) => !state.seenIds.has(c.id) && !state.replacements.has(c.id)
  )

  // Mark frozen (seen, not replaced) — leave content alone
  for (const c of candidates) {
    if (state.seenIds.has(c.id) && !state.replacements.has(c.id)) {
      /* frozen */
    }
  }

  // Persist: (1) over per-result threshold (2) help aggregate budget
  const toPersist: Cand[] = []
  let aggregate = candidates
    .filter((c) => !state.replacements.has(c.id) && !replacementMap.has(c.id))
    .reduce((s, c) => s + c.size, 0)

  for (const c of fresh) {
    const toolName = nameById.get(c.id) || ''
    if (SKIP_PERSIST.has(toolName)) {
      state.seenIds.add(c.id)
      continue
    }
    if (c.size > threshold) {
      toPersist.push(c)
      continue
    }
  }

  // If still over aggregate budget, persist largest fresh remaining
  const freshLeft = fresh
    .filter((c) => !toPersist.some((t) => t.id === c.id))
    .filter((c) => !SKIP_PERSIST.has(nameById.get(c.id) || ''))
    .sort((a, b) => b.size - a.size)

  for (const c of toPersist) {
    aggregate -= c.size
  }
  for (const c of freshLeft) {
    if (aggregate <= budget) break
    toPersist.push(c)
    aggregate -= c.size
  }

  for (const c of toPersist) {
    const persisted = await persistToolResult(
      c.content,
      c.id,
      opts.cwd,
      opts.sessionId
    )
    if ('error' in persisted) {
      state.seenIds.add(c.id)
      continue
    }
    const replacement = buildLargeToolResultMessage(persisted)
    state.replacements.set(c.id, replacement)
    state.seenIds.add(c.id)
    replacementMap.set(c.id, replacement)
    newlyReplaced += 1
  }

  // Mark remaining fresh as seen (frozen unreplaced)
  for (const c of fresh) {
    if (!state.seenIds.has(c.id)) state.seenIds.add(c.id)
  }

  if (replacementMap.size === 0) {
    return { messages, newlyReplaced: 0, reapplied }
  }

  const next = messages.map((m) => {
    if (m.role !== 'tool' || !m.tool_call_id) return m
    const rep = replacementMap.get(m.tool_call_id)
    if (rep === undefined || m.content === rep) return m
    return { ...m, content: rep }
  })

  return { messages: next, newlyReplaced, reapplied }
}
