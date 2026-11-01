/**
 * Fork context builders — Claude Code forkSubagent.ts spirit
 * (share parent conversation prefix; forbid recursive fork).
 * Reimplementation only; no Anthropic source paste.
 */
import type { ChatMessage } from '../../shared/types.js'
import { stripBinaryContentParts } from '../../shared/messageContent.js'

/** Marker tag in fork worker directive (CC FORK_BOILERPLATE_TAG spirit). */
export const FORK_BOILERPLATE_TAG = 'ackem_fork_boilerplate'

export const FORK_PLACEHOLDER_RESULT =
  'Fork started — processing in background'

const DEFAULT_MAX_PREFIX_MESSAGES = 48
const DEFAULT_MAX_TOOL_CHARS = 4_000

export function isInForkChild(messages: ChatMessage[]): boolean {
  for (const m of messages) {
    if (m.role !== 'user' || typeof m.content !== 'string') continue
    if (m.content.includes(`<${FORK_BOILERPLATE_TAG}>`)) return true
  }
  return false
}

export function buildForkDirective(directive: string): string {
  return `<${FORK_BOILERPLATE_TAG}>
STOP. READ THIS FIRST.

You are a forked worker process. You are NOT the main agent.

RULES (non-negotiable):
1. You ARE the fork. Do NOT spawn sub-agents; execute directly.
2. Do NOT converse, ask questions, or suggest next steps.
3. USE your tools directly; report once at the end.
4. Stay strictly within your directive's scope.
5. Keep your report under 500 words unless the directive says otherwise.
6. Your response MUST begin with "Scope:".

Output format (plain text labels):
  Scope: <one sentence>
  Result: <key findings>
  Key files: <paths if research>
  Issues: <only if needed>
</${FORK_BOILERPLATE_TAG}>

Directive: ${directive.trim()}`
}

/**
 * Build shared parent prefix for a fork child (CC buildForkedMessages spirit).
 * OpenAI chat shape: ensure every tool_call has a tool_result (placeholders OK).
 */
export function buildForkPrefixMessages(
  parentMessages: ChatMessage[],
  directive: string,
  opts?: { maxMessages?: number; maxToolChars?: number }
): ChatMessage[] {
  const maxMessages = opts?.maxMessages ?? DEFAULT_MAX_PREFIX_MESSAGES
  const maxToolChars = opts?.maxToolChars ?? DEFAULT_MAX_TOOL_CHARS

  const nonSystem = parentMessages.filter((m) => m.role !== 'system')
  const sliced = nonSystem.slice(-maxMessages)
  const compacted = sliced.map((m) => compactMessage(m, maxToolChars))
  const withResults = ensureToolResults(compacted)

  return [
    ...withResults,
    { role: 'user', content: buildForkDirective(directive) }
  ]
}

function compactMessage(m: ChatMessage, maxToolChars: number): ChatMessage {
  if (Array.isArray(m.content)) {
    return { ...m, content: stripBinaryContentParts(m.content) }
  }
  if (m.role === 'tool' && typeof m.content === 'string') {
    if (m.content.length <= maxToolChars) return m
    return {
      ...m,
      content: m.content.slice(0, maxToolChars) + '\n…[truncated for fork]'
    }
  }
  if (m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 8_000) {
    return { ...m, content: m.content.slice(0, 8_000) + '\n…[truncated for fork]' }
  }
  return m
}

/** Ensure every assistant tool_call has a tool result (placeholder if missing). */
export function ensureToolResults(messages: ChatMessage[]): ChatMessage[] {
  const haveResult = new Set<string>()
  for (const m of messages) {
    if (m.role === 'tool' && m.tool_call_id) haveResult.add(m.tool_call_id)
  }

  const out: ChatMessage[] = []
  for (const m of messages) {
    out.push(m)
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue
    for (const call of m.tool_calls) {
      if (haveResult.has(call.id)) continue
      out.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: FORK_PLACEHOLDER_RESULT
      })
      haveResult.add(call.id)
    }
  }
  return out
}

export function forkSystemPrompt(cwd: string, inherited?: string): string {
  if (inherited?.trim()) {
    return `${inherited.trim()}

---
FORK WORKER OVERRIDE: You are a forked worker in ${cwd}. Do not spawn agents. Follow the directive in the last user message. Begin your final reply with "Scope:".`
  }
  return `You are a forked worker for AckemCode.

Working directory: ${cwd}

You inherited conversation context from the parent. Execute the directive directly with tools. Do NOT spawn sub-agents. Final reply must start with "Scope:".`
}
