/**
 * Deferred tool loading — Claude Code ToolSearch / defer_loading spirit (lightweight).
 * When many tools (esp. MCP) are registered, only core + discovered tools are sent
 * to the model; `tool_search` discovers the rest by name/query.
 */
import type { ChatMessage, ToolDefinition } from '../../shared/types.js'
import { flattenMessageContent } from '../../shared/messageContent.js'

export const TOOL_SEARCH_NAME = 'tool_search'

/** Always keep these even when deferring (core coding surface). */
export const CORE_TOOL_NAMES = new Set([
  'read_file',
  'write_file',
  'search_replace',
  'list_dir',
  'glob',
  'grep',
  'bash',
  'powershell',
  'web_search',
  'web_fetch',
  'ask_user',
  'enter_plan_mode',
  'exit_plan_mode',
  'todo_write',
  'task_create',
  'task_get',
  'task_update',
  'task_list',
  'agent',
  'agent_stop',
  'agent_output',
  'verify_delivery',
  TOOL_SEARCH_NAME
])

export function isDeferrableToolName(name: string): boolean {
  if (CORE_TOOL_NAMES.has(name)) return false
  // MCP tools (mcpManager naming) + optional skill/cron/worktree can stay available
  // Prefer deferring MCP namespace first (highest cardinality).
  if (name.startsWith('mcp_') || name.includes('__')) return true
  return false
}

export function resolveDeferToolThreshold(
  env: NodeJS.ProcessEnv = process.env
): number {
  if (env.ACKEM_DEFER_TOOLS === '0' || env.ACKEM_DEFER_TOOLS === 'false') {
    return Number.POSITIVE_INFINITY
  }
  if (env.ACKEM_DEFER_TOOLS === '1' || env.ACKEM_DEFER_TOOLS === 'true') {
    return 1 // force defer whenever any deferrable exists
  }
  const n = Number(env.ACKEM_DEFER_TOOLS_THRESHOLD)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 40
}

export function shouldDeferTools(
  toolCount: number,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return toolCount >= resolveDeferToolThreshold(env)
}

/**
 * Tools already used in the conversation, plus names listed by tool_search results.
 */
export function extractDiscoveredToolNames(
  messages: readonly ChatMessage[]
): Set<string> {
  const out = new Set<string>()
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) {
        if (c.function?.name) out.add(c.function.name)
      }
    }
    if (m.role === 'tool' && m.name === TOOL_SEARCH_NAME && m.content) {
      for (const line of flattenMessageContent(m.content).split(/\r?\n/)) {
        const discovered = line.match(/^DISCOVERED:\s*(.+)$/i)
        if (discovered) {
          for (const part of discovered[1]!.split(/[,]+/)) {
            const n = part.trim()
            if (n) out.add(n)
          }
          continue
        }
        const named = line.match(/^-\s*`?([A-Za-z0-9_.:-]+)`?/)
        if (named?.[1]) out.add(named[1])
      }
    }
  }
  return out
}

export function selectToolsForModel(
  all: ToolDefinition[],
  discovered: ReadonlySet<string>,
  env: NodeJS.ProcessEnv = process.env
): {
  tools: ToolDefinition[]
  deferredCount: number
  deferred: boolean
} {
  if (!shouldDeferTools(all.length, env)) {
    return {
      tools: all.filter((t) => t.function.name !== TOOL_SEARCH_NAME),
      deferredCount: 0,
      deferred: false
    }
  }
  const deferredNames: string[] = []
  const active: ToolDefinition[] = []
  let hasToolSearch = false
  for (const t of all) {
    const name = t.function.name
    if (name === TOOL_SEARCH_NAME) {
      hasToolSearch = true
      active.push(t)
      continue
    }
    if (!isDeferrableToolName(name) || discovered.has(name)) {
      active.push(t)
    } else {
      deferredNames.push(name)
    }
  }
  if (deferredNames.length === 0) {
    return {
      tools: active.filter((t) => t.function.name !== TOOL_SEARCH_NAME),
      deferredCount: 0,
      deferred: false
    }
  }
  if (!hasToolSearch) {
    // Caller should include TOOL_SEARCH definition; if missing, still defer silently
  }
  return {
    tools: active,
    deferredCount: deferredNames.length,
    deferred: true
  }
}

export function formatToolSearchResult(
  query: string,
  matches: Array<{ name: string; description: string }>
): string {
  if (!matches.length) {
    return `No deferred tools matched query=${JSON.stringify(query)}.`
  }
  const lines = [
    `DISCOVERED: ${matches.map((m) => m.name).join(', ')}`,
    `Matched ${matches.length} tool(s) for ${JSON.stringify(query)}:`,
    ...matches.map(
      (m) => `- \`${m.name}\`: ${m.description.slice(0, 160)}`
    ),
    '',
    'These tools are now available on subsequent turns. Call them by name.'
  ]
  return lines.join('\n')
}

export function searchDeferredTools(
  all: ToolDefinition[],
  discovered: ReadonlySet<string>,
  query: string
): Array<{ name: string; description: string }> {
  const q = query.trim().toLowerCase()
  const out: Array<{ name: string; description: string }> = []
  for (const t of all) {
    const name = t.function.name
    if (!isDeferrableToolName(name)) continue
    if (discovered.has(name) && q && !name.toLowerCase().includes(q)) {
      // already known — still allow re-list if query matches
    }
    const desc = t.function.description || ''
    if (
      !q ||
      name.toLowerCase().includes(q) ||
      desc.toLowerCase().includes(q)
    ) {
      out.push({ name, description: desc })
    }
  }
  return out.slice(0, 30)
}
