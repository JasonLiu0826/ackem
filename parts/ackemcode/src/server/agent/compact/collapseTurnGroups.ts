/**
 * L2 — collapse oldest assistant+tool turn blocks; keep last KEEP_TURN_BLOCKS full.
 */
import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { COLLAPSED_PREFIX } from './contextCollapseFull.js'
import type { ContextCollapseCommit } from './contextCollapseCommits.js'

const MIN_TURN_BLOCKS = 4
const KEEP_TURN_BLOCKS = 2
const MIN_TOOLS_IN_BLOCK = 2
const MIN_BLOCK_CHARS = 2_000

export type TurnBlock = { start: number; end: number; toolIndices: number[] }

function findTurnBlocks(messages: ChatMessage[]): TurnBlock[] {
  const blocks: TurnBlock[] = []
  let i = 0
  while (i < messages.length) {
    const m = messages[i]!
    if (m.role !== 'assistant' || !m.tool_calls?.length) {
      i += 1
      continue
    }
    const start = i
    const toolIndices: number[] = []
    i += 1
    while (i < messages.length) {
      const t = messages[i]!
      if (t.role === 'tool') {
        toolIndices.push(i)
        i += 1
        continue
      }
      if (t.role === 'assistant' && t.tool_calls?.length) {
        // New assistant+tools batch = next turn block (do not merge separate batches).
        if (toolIndices.length >= MIN_TOOLS_IN_BLOCK) break
        i += 1
        continue
      }
      break
    }
    const end = i - 1
    if (toolIndices.length >= MIN_TOOLS_IN_BLOCK) {
      blocks.push({ start, end, toolIndices })
    }
  }
  return blocks
}

function blockCharSum(messages: ChatMessage[], block: TurnBlock): number {
  let n = 0
  for (const idx of block.toolIndices) {
    const c = flattenMessageContent(messages[idx]!.content)
    if (c.startsWith(COLLAPSED_PREFIX)) continue
    n += c.length
  }
  return n
}

export function collapseTurnGroups(messages: ChatMessage[]): {
  messages: ChatMessage[]
  collapsedGroups: number
  commits: ContextCollapseCommit[]
} {
  if (process.env.ACKEM_DISABLE_TURN_COLLAPSE === '1') {
    return { messages, collapsedGroups: 0, commits: [] }
  }

  const blocks = findTurnBlocks(messages)
  if (blocks.length < MIN_TURN_BLOCKS) {
    return { messages, collapsedGroups: 0, commits: [] }
  }

  const toFold = blocks.slice(0, blocks.length - KEEP_TURN_BLOCKS)
  const foldSet = new Set<number>()
  for (const b of toFold) {
    if (blockCharSum(messages, b) < MIN_BLOCK_CHARS) continue
    for (const idx of b.toolIndices) foldSet.add(idx)
  }

  if (!foldSet.size) return { messages, collapsedGroups: 0, commits: [] }

  const now = new Date().toISOString()
  let collapsedGroups = 0
  const commits: ContextCollapseCommit[] = []
  const next = messages.map((m, i) => {
    if (!foldSet.has(i) || m.role !== 'tool') return m
    const text = flattenMessageContent(m.content)
    if (text.startsWith(COLLAPSED_PREFIX)) return m
    collapsedGroups += 1
    const name = m.name || 'tool'
    const collapsedContent = `${COLLAPSED_PREFIX}turn block; ${name}; ${text.length} chars omitted — re-run tool or read_file]`
    if (m.tool_call_id) {
      commits.push({
        at: now,
        toolCallId: m.tool_call_id,
        toolName: name,
        label: 'turn block',
        originalChars: text.length,
        collapsedContent
      })
    }
    return {
      ...m,
      content: collapsedContent
    }
  })

  return { messages: next, collapsedGroups, commits }
}
