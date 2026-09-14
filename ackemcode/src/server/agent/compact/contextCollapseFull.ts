/**
 * L1 — full context collapse: read/search + shell + edits + fetch (CC spirit, Ackem-owned).
 */
import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { TOOL_RESULT_CLEARED_MESSAGE } from './toolResultStorage.js'
import type { ContextCollapseCommit } from './contextCollapseCommits.js'
import { collapseTurnGroups } from './collapseTurnGroups.js'

export const COLLAPSED_PREFIX = '[Context collapsed — '

const READ_SEARCH_TOOLS = new Set([
  'read_file',
  'grep',
  'glob',
  'list_dir',
  'web_search'
])

const SHELL_TOOLS = new Set(['bash', 'powershell'])
const EDIT_TOOLS = new Set(['search_replace', 'write_file'])
const OTHER_COLLAPSIBLE = new Set(['web_fetch'])

const MIN_GROUP = 3
const MIN_GROUP_SHELL = 2
const MIN_BODY_CHARS = 400
const MIN_BODY_SHELL = 600
const KEEP_TAIL = 2

export function isContextCollapseEnabled(): boolean {
  return process.env.ACKEM_DISABLE_CONTEXT_COLLAPSE !== '1'
}

function toolCategory(name: string): 'read' | 'shell' | 'edit' | 'other' | null {
  if (READ_SEARCH_TOOLS.has(name)) return 'read'
  if (SHELL_TOOLS.has(name)) return 'shell'
  if (EDIT_TOOLS.has(name)) return 'edit'
  if (OTHER_COLLAPSIBLE.has(name)) return 'other'
  return null
}

function pathHint(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return name
  const o = input as Record<string, unknown>
  if (typeof o.path === 'string') return o.path
  if (typeof o.file_path === 'string') return o.file_path
  if (typeof o.pattern === 'string') return `${name}:${o.pattern}`
  if (typeof o.command === 'string') {
    const cmd = o.command.trim()
    return cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd
  }
  if (typeof o.url === 'string') return o.url
  return name
}

function buildToolMeta(messages: ChatMessage[]): Map<
  string,
  { name: string; pathHint: string }
> {
  const map = new Map<string, { name: string; pathHint: string }>()
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue
    for (const c of m.tool_calls) {
      let input: unknown = {}
      try {
        input = c.function.arguments ? JSON.parse(c.function.arguments) : {}
      } catch {
        /* keep empty */
      }
      map.set(c.id, {
        name: c.function.name,
        pathHint: pathHint(c.function.name, input)
      })
    }
  }
  return map
}

function minGroupFor(name: string): number {
  return SHELL_TOOLS.has(name) ? MIN_GROUP_SHELL : MIN_GROUP
}

function minBodyFor(name: string): number {
  return SHELL_TOOLS.has(name) ? MIN_BODY_SHELL : MIN_BODY_CHARS
}

function isCollapsibleToolMessage(
  m: ChatMessage,
  meta: Map<string, { name: string; pathHint: string }>
): boolean {
  if (m.role !== 'tool' || !m.tool_call_id) return false
  const content = flattenMessageContent(m.content)
  if (!content || content === TOOL_RESULT_CLEARED_MESSAGE) return false
  if (content.startsWith(COLLAPSED_PREFIX)) return false
  const name = meta.get(m.tool_call_id)?.name || m.name || ''
  const cat = toolCategory(name)
  if (!cat) return false
  return content.length >= minBodyFor(name)
}

function collapseBody(
  info: { name: string; pathHint: string } | undefined,
  m: ChatMessage,
  chars: number
): string {
  const label = info?.pathHint || info?.name || m.name || 'tool'
  const kind = info?.name || 'tool'
  return `${COLLAPSED_PREFIX}${kind} on ${label}; ${chars} chars omitted — use read_file/grep/bash to recover]`
}

function collapseRuns(
  messages: ChatMessage[],
  meta: Map<string, { name: string; pathHint: string }>
): {
  messages: ChatMessage[]
  collapsedCount: number
  commits: ContextCollapseCommit[]
} {
  const runs: number[][] = []
  let current: number[] = []
  let currentMinGroup = MIN_GROUP

  const flushRun = () => {
    if (current.length >= currentMinGroup) runs.push([...current])
    current = []
    currentMinGroup = MIN_GROUP
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!
    if (isCollapsibleToolMessage(m, meta)) {
      const name = meta.get(m.tool_call_id!)?.name || m.name || ''
      currentMinGroup = Math.min(currentMinGroup, minGroupFor(name))
      current.push(i)
      continue
    }
    if (!current.length) continue
    const bridge =
      m.role === 'assistant' &&
      Boolean(m.tool_calls?.length) &&
      !flattenMessageContent(m.content).trim()
    if (bridge) continue
    flushRun()
  }
  flushRun()

  if (!runs.length) {
    return { messages, collapsedCount: 0, commits: [] }
  }

  const toCollapse = new Set<number>()
  for (const run of runs) {
    const collapseThrough = run.length - KEEP_TAIL
    for (let j = 0; j < collapseThrough; j++) {
      toCollapse.add(run[j]!)
    }
  }

  if (!toCollapse.size) {
    return { messages, collapsedCount: 0, commits: [] }
  }

  const now = new Date().toISOString()
  let collapsedCount = 0
  const commits: ContextCollapseCommit[] = []
  const next = messages.map((m, i) => {
    if (!toCollapse.has(i) || m.role !== 'tool' || !m.tool_call_id) return m
    const info = meta.get(m.tool_call_id)
    const chars = flattenMessageContent(m.content).length
    collapsedCount += 1
    const collapsedContent = collapseBody(info, m, chars)
    commits.push({
      at: now,
      toolCallId: m.tool_call_id,
      toolName: info?.name || m.name || 'tool',
      label: info?.pathHint || '',
      originalChars: chars,
      collapsedContent
    })
    return { ...m, content: collapsedContent }
  })

  return { messages: next, collapsedCount, commits }
}

/**
 * L1 + L2: tool-run collapse then turn-block collapse.
 */
export function runFullContextCollapse(
  messages: ChatMessage[]
): {
  messages: ChatMessage[]
  collapsedCount: number
  turnGroupsCollapsed: number
  commits: ContextCollapseCommit[]
} {
  if (!isContextCollapseEnabled()) {
    return { messages, collapsedCount: 0, turnGroupsCollapsed: 0, commits: [] }
  }

  const meta = buildToolMeta(messages)
  const run1 = collapseRuns(messages, meta)
  const turn = collapseTurnGroups(run1.messages)
  const commits = [...run1.commits, ...turn.commits]
  return {
    messages: turn.messages,
    collapsedCount: run1.collapsedCount,
    turnGroupsCollapsed: turn.collapsedGroups,
    commits
  }
}

/** @deprecated use runFullContextCollapse — kept for B7 smokes */
export function collapseReadSearchMessages(
  messages: ChatMessage[]
): { messages: ChatMessage[]; collapsedCount: number } {
  const r = runFullContextCollapse(messages)
  return { messages: r.messages, collapsedCount: r.collapsedCount + r.turnGroupsCollapsed }
}
