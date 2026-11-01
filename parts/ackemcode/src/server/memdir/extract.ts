/**
 * Turn-end memory extraction — Claude Code services/extractMemories spirit.
 *
 * Default path: memdir-only tool agent (max 5 turns) with per-session cursor
 * + in-flight coalesce. Fallbacks: JSON LLM → heuristic.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ChatMessage } from '../../shared/types.js'
import { chatCompletion } from '../agent/llm.js'
import type { EffortLevel } from '../../shared/types.js'
import { assertNoSecretsInMemory } from './secretScan.js'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  MEMORY_TYPES,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
  type MemoryType
} from './memoryTypes.js'
import {
  ensureMemoryDirExists,
  getAutoMemPath,
  isAutoMemoryEnabled
} from './paths.js'
import { syncMemoryIndex } from './entrypoint.js'
import { formatMemoryManifest, scanMemoryFiles } from './scan.js'
import {
  runMemoryExtractAgent,
  topicFilesWritten
} from './extractAgent.js'

export type ExtractMemoriesResult = {
  skipped: boolean
  reason?: string
  saved: Array<{ filename: string; name: string; type: MemoryType }>
  writtenPaths?: string[]
  via?: 'agent' | 'llm_json' | 'heuristic'
}

type SessionExtractState = {
  /** messages.length after last successful advance */
  lastMessageCount: number
  inProgress: boolean
  pending: ExecuteParams | null
  turnsSinceLast: number
  inFlight: Set<Promise<void>>
}

type ExecuteParams = {
  cwd: string
  userText: string
  messages: ChatMessage[]
  memoryWrittenThisTurn?: boolean
  sessionId?: string
  llm?: {
    apiBaseUrl: string
    apiKey: string
    model: string
    effort: EffortLevel
  }
  signal?: AbortSignal
}

const sessions = new Map<string, SessionExtractState>()

function sessionKey(cwd: string, sessionId?: string): string {
  return `${sessionId || 'default'}::${path.resolve(cwd)}`
}

function getState(key: string): SessionExtractState {
  let s = sessions.get(key)
  if (!s) {
    s = {
      lastMessageCount: 0,
      inProgress: false,
      pending: null,
      turnsSinceLast: 0,
      inFlight: new Set()
    }
    sessions.set(key, s)
  }
  return s
}

/** Test helper */
export function resetExtractMemoriesState(sessionId?: string, cwd?: string): void {
  if (sessionId && cwd) {
    sessions.delete(sessionKey(cwd, sessionId))
    return
  }
  sessions.clear()
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return s || `memory-${Date.now().toString(36)}`
}

export function hasMemoryWritesInMessages(
  messages: ChatMessage[],
  memoryDir: string,
  cwd?: string
): boolean {
  const root = path.resolve(memoryDir)
  const base = cwd ? path.resolve(cwd) : undefined
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue
    for (const call of m.tool_calls) {
      const name = call.function.name
      if (name !== 'write_file' && name !== 'search_replace') continue
      try {
        const args = JSON.parse(call.function.arguments || '{}') as {
          path?: string
          file_path?: string
        }
        const p = String(args.path ?? args.file_path ?? '')
        if (!p) continue
        const abs = path.isAbsolute(p)
          ? path.resolve(p)
          : path.resolve(base ?? process.cwd(), p)
        const rel = path.relative(root, abs)
        if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
          return true
        }
        if (p.replace(/\\/g, '/').includes(root.replace(/\\/g, '/'))) {
          return true
        }
      } catch {
        /* ignore */
      }
    }
  }
  return false
}

function countModelVisible(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    .length
}

function buildTranscriptSince(
  messages: ChatMessage[],
  sinceCount: number,
  maxChars = 14_000
): { text: string; newVisible: number } {
  const slice = messages.slice(Math.max(0, sinceCount))
  const parts: string[] = []
  let used = 0
  let newVisible = 0
  for (const m of slice) {
    if (m.role === 'system') continue
    if (m.role === 'user' || m.role === 'assistant') newVisible += 1
    let piece = ''
    if (m.role === 'user' || m.role === 'assistant') {
      const text = String(m.content ?? '').trim()
      if (!text || text.includes('<!--ackem_mem ')) continue
      piece = `${m.role.toUpperCase()}:\n${text}`
    } else if (m.role === 'tool') {
      piece = `TOOL(${m.name || '?'}):\n${String(m.content ?? '').slice(0, 400)}`
    }
    if (!piece) continue
    if (used + piece.length > maxChars) break
    parts.push(piece)
    used += piece.length
  }
  return { text: parts.join('\n\n'), newVisible }
}

function buildAgentPrompt(
  newMessageCount: number,
  manifest: string,
  transcript: string,
  userText: string
): string {
  const memBlock =
    manifest.trim().length > 0
      ? `\n\n## Existing memory files\n\n${manifest}\n\nCheck this list before writing — update an existing file rather than creating a duplicate.`
      : '\n\n## Existing memory files\n\n(none yet)'

  return [
    `You are now acting as the memory extraction subagent. Analyze the most recent ~${newMessageCount} messages and update persistent memories.`,
    '',
    'Use read_file / grep / glob / list_dir freely. Use write_file / search_replace ONLY inside the memory directory.',
    'Prefer: turn 1 — read topic files you might update; turn 2 — write/edit. Do not investigate the project codebase.',
    memBlock,
    '',
    'If the user explicitly asks you to remember something, save it. If they ask to forget something, remove/update the entry.',
    '',
    TYPES_SECTION_INDIVIDUAL,
    '',
    WHAT_NOT_TO_SAVE_SECTION,
    '',
    '## How to save memories',
    '',
    '**Step 1** — write/update a topic file with frontmatter:',
    '',
    ...MEMORY_FRONTMATTER_EXAMPLE,
    '',
    '**Step 2** — add/update a one-line pointer in MEMORY.md (index only, no frontmatter).',
    '',
    '## Latest user message',
    userText.slice(0, 4000),
    '',
    '## Recent transcript (since last extraction)',
    transcript || '(empty)',
    '',
    'If nothing durable should be saved, reply with a short note and no tools.'
  ].join('\n')
}

type Candidate = {
  name: string
  description: string
  type: MemoryType
  content: string
}

function heuristicExtract(userText: string, assistantText: string): Candidate[] {
  const blob = `${userText}\n${assistantText}`
  const out: Candidate[] = []
  const prefer =
    blob.match(
      /(?:记住|remember(?:\s+that)?|always|prefer|不要|don't|never)\s*[:：]?\s*([^\n.!?]{8,160})/i
    ) ||
    blob.match(
      /(?:项目约定|团队约定|coding style|convention)[:：]\s*([^\n]{8,160})/i
    )
  if (prefer?.[1]) {
    const fact = prefer[1].trim()
    const isFeedback = /don't|never|不要|别|prefer|always|记住/i.test(blob)
    out.push({
      name: slugify(fact).slice(0, 40),
      description: fact.slice(0, 120),
      type: isFeedback ? 'feedback' : 'project',
      content: [
        fact,
        '',
        '**Why:** Stated or reinforced in conversation; durable across sessions.',
        '**How to apply:** Follow this unless the user overrides it.'
      ].join('\n')
    })
  }
  return out
}

async function llmJsonExtract(params: {
  transcript: string
  userText: string
  assistantText: string
  manifest: string
  llm: NonNullable<ExecuteParams['llm']>
  signal?: AbortSignal
}): Promise<Candidate[]> {
  if (process.env.ACKEM_MEMORY_EXTRACT_LLM === '0') return []
  if (!params.llm.apiKey?.trim()) return []

  const prompt = [
    'Extract 0–5 durable memories. Return ONLY JSON:',
    '{"memories":[{"name":"","description":"","type":"user|feedback|project|reference","content":""}]}',
    'Skip secrets and duplicates of existing files.',
    '',
    '## Existing',
    params.manifest || '(none)',
    '',
    'USER:',
    params.userText.slice(0, 4000),
    '',
    'ASSISTANT:',
    params.assistantText.slice(0, 4000),
    '',
    'TRANSCRIPT:',
    params.transcript.slice(0, 8000)
  ].join('\n')

  try {
    const { message: msg } = await chatCompletion({
      apiBaseUrl: params.llm.apiBaseUrl,
      apiKey: params.llm.apiKey,
      model: params.llm.model,
      effort: 'low',
      messages: [
        {
          role: 'system',
          content: 'Extract durable memories as JSON. Never include secrets.'
        },
        { role: 'user', content: prompt }
      ],
      tools: [],
      signal: params.signal
    })
    const text = String(msg.content ?? '')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0]) as {
      memories?: Array<{
        name?: string
        description?: string
        type?: string
        content?: string
      }>
    }
    const out: Candidate[] = []
    for (const m of parsed.memories ?? []) {
      const type = MEMORY_TYPES.find((t) => t === m.type) ?? 'project'
      const name = String(m.name || '').trim()
      const content = String(m.content || '').trim()
      if (!name || !content || content.length < 12) continue
      out.push({
        name: slugify(name),
        description: String(m.description || name).slice(0, 160),
        type,
        content
      })
    }
    return out.slice(0, 5)
  } catch {
    return []
  }
}

async function writeTopic(
  memoryDir: string,
  c: Candidate
): Promise<{ filename: string; name: string; type: MemoryType }> {
  assertNoSecretsInMemory(c.content)
  assertNoSecretsInMemory(c.description)
  const filename = `${slugify(c.name)}.md`
  const body = [
    '---',
    `name: ${c.name}`,
    `description: ${c.description}`,
    `type: ${c.type}`,
    '---',
    '',
    c.content.trim(),
    ''
  ].join('\n')
  assertNoSecretsInMemory(body)
  await fs.mkdir(memoryDir, { recursive: true })
  await fs.writeFile(path.join(memoryDir, filename), body, 'utf8')
  return { filename, name: c.name, type: c.type }
}

function extractEveryN(): number {
  const n = Number(process.env.ACKEM_EXTRACT_EVERY_N || '1')
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

async function runExtractionInner(
  params: ExecuteParams,
  state: SessionExtractState,
  isTrailingRun: boolean
): Promise<ExtractMemoriesResult> {
  if (!isAutoMemoryEnabled()) {
    return { skipped: true, reason: 'auto_memory_disabled', saved: [] }
  }
  if (process.env.ACKEM_DISABLE_EXTRACT_MEMORIES === '1') {
    return { skipped: true, reason: 'extract_disabled', saved: [] }
  }

  const memoryDir = await ensureMemoryDirExists(params.cwd)
  const wrote =
    params.memoryWrittenThisTurn ||
    hasMemoryWritesInMessages(params.messages, memoryDir, params.cwd)

  if (wrote) {
    await syncMemoryIndex(params.cwd)
    state.lastMessageCount = params.messages.length
    return { skipped: true, reason: 'main_agent_wrote', saved: [] }
  }

  // Compact / rewind may shrink history below the cursor. Reset like CC's
  // "cursor uuid missing after compact → recount all visible messages".
  if (params.messages.length < state.lastMessageCount) {
    state.lastMessageCount = 0
  }

  if (!isTrailingRun) {
    state.turnsSinceLast += 1
    if (state.turnsSinceLast < extractEveryN()) {
      return { skipped: true, reason: 'throttled', saved: [] }
    }
  }
  state.turnsSinceLast = 0

  const { text: transcript, newVisible } = buildTranscriptSince(
    params.messages,
    state.lastMessageCount
  )
  // Nothing new since cursor (and cursor not reset by compact to empty)
  if (
    state.lastMessageCount > 0 &&
    newVisible === 0 &&
    params.messages.length <= state.lastMessageCount
  ) {
    return { skipped: true, reason: 'nothing_new', saved: [] }
  }

  const existing = await scanMemoryFiles(memoryDir, params.signal)
  const manifest = formatMemoryManifest(existing)
  const lastAsst = [...params.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content)
  const assistantText = String(lastAsst?.content ?? '')

  const useAgent =
    process.env.ACKEM_MEMORY_EXTRACT_AGENT !== '0' &&
    Boolean(params.llm?.apiKey?.trim()) &&
    process.env.ACKEM_MEMORY_EXTRACT_LLM !== '0'

  if (useAgent && params.llm) {
    const prompt = buildAgentPrompt(
      Math.max(1, newVisible || countModelVisible(params.messages)),
      manifest,
      transcript,
      params.userText
    )
    const agent = await runMemoryExtractAgent({
      cwd: params.cwd,
      memoryDir,
      userPrompt: prompt,
      llm: params.llm,
      signal: params.signal
    })
    // Advance cursor only on non-hard-failure (ok or wrote something)
    if (agent.ok || agent.writtenPaths.length > 0) {
      state.lastMessageCount = params.messages.length
      await syncMemoryIndex(params.cwd)
      const topics = topicFilesWritten(agent.writtenPaths)
      const saved = topics.map((p) => ({
        filename: path.basename(p),
        name: path.basename(p, '.md'),
        type: 'project' as MemoryType
      }))
      return {
        skipped: saved.length === 0,
        reason: saved.length === 0 ? 'nothing_to_save' : undefined,
        saved,
        writtenPaths: agent.writtenPaths,
        via: 'agent'
      }
    }
    // fall through to JSON / heuristic on hard failure
  }

  let candidates: Candidate[] = []
  let via: ExtractMemoriesResult['via'] = 'heuristic'
  if (params.llm?.apiKey && process.env.ACKEM_MEMORY_EXTRACT_LLM !== '0') {
    candidates = await llmJsonExtract({
      transcript,
      userText: params.userText,
      assistantText,
      manifest,
      llm: params.llm,
      signal: params.signal
    })
    if (candidates.length) via = 'llm_json'
  }
  if (candidates.length === 0) {
    candidates = heuristicExtract(params.userText, assistantText)
    via = 'heuristic'
  }

  if (candidates.length === 0) {
    state.lastMessageCount = params.messages.length
    return { skipped: true, reason: 'nothing_to_save', saved: [], via }
  }

  const saved: ExtractMemoriesResult['saved'] = []
  for (const c of candidates) {
    try {
      saved.push(await writeTopic(memoryDir, c))
    } catch {
      /* secret/IO */
    }
  }
  if (saved.length) {
    await syncMemoryIndex(params.cwd)
  }
  state.lastMessageCount = params.messages.length
  return { skipped: saved.length === 0, saved, via }
}

async function runExtractionWithCoalesce(
  params: ExecuteParams,
  state: SessionExtractState,
  isTrailingRun = false
): Promise<ExtractMemoriesResult> {
  state.inProgress = true
  try {
    return await runExtractionInner(params, state, isTrailingRun)
  } finally {
    state.inProgress = false
    const trailing = state.pending
    state.pending = null
    if (trailing) {
      await runExtractionWithCoalesce(trailing, state, true)
    }
  }
}

/**
 * Public entry — Claude Code executeExtractMemories spirit.
 * Coalesces overlapping calls per session; advances cursor after success / skip-write.
 */
export async function executeExtractMemories(
  params: ExecuteParams
): Promise<ExtractMemoriesResult> {
  const key = sessionKey(params.cwd, params.sessionId)
  const state = getState(key)

  if (state.inProgress) {
    state.pending = params
    return { skipped: true, reason: 'coalesced', saved: [] }
  }

  const p = runExtractionWithCoalesce(params, state, false)
  const wrap = p.then(
    () => undefined,
    () => undefined
  )
  state.inFlight.add(wrap)
  try {
    return await p
  } finally {
    state.inFlight.delete(wrap)
  }
}

/** Await in-flight extractions (including trailing). Soft timeout. */
export async function drainPendingExtraction(
  opts?: { cwd?: string; sessionId?: string; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 60_000
  const keys =
    opts?.cwd != null
      ? [sessionKey(opts.cwd, opts.sessionId)]
      : [...sessions.keys()]
  const promises: Promise<void>[] = []
  for (const k of keys) {
    const s = sessions.get(k)
    if (s) promises.push(...s.inFlight)
  }
  if (!promises.length) return
  await Promise.race([
    Promise.all(promises).catch(() => {}),
    new Promise<void>((r) => setTimeout(r, timeoutMs))
  ])
}

export async function writeMemoryNoteForTest(
  cwd: string,
  note: Candidate
): Promise<string> {
  const dir = await getAutoMemPath(cwd)
  await fs.mkdir(dir, { recursive: true })
  const r = await writeTopic(dir, note)
  await syncMemoryIndex(cwd)
  return path.join(dir, r.filename)
}
