/**
 * Microcompact — Claude Code microCompact COMPACTABLE_TOOLS + stable clear spirit.
 */
import type { ChatMessage } from '../../../shared/types.js'
import {
  flattenMessageContent,
  countMediaParts,
  stripBinaryContentParts
} from '../../../shared/messageContent.js'
import { TOOL_RESULT_CLEARED_MESSAGE } from './toolResultStorage.js'

export type MicroCompactOpts = {
  /** Keep this many most-recent *compactable* tool results at full length */
  keepRecentToolResults?: number
  /**
   * When true (default), replace old tool bodies with the stable cleared
   * message. When false, leave a short head preview (legacy / tests).
   */
  stableClear?: boolean
  /** Only used when stableClear=false */
  maxOldToolResultChars?: number
}

const DEFAULT_KEEP = 4
const DEFAULT_MAX_OLD = 1_200

/**
 * Tools eligible for microcompact (CC COMPACTABLE_TOOLS → Ackem names).
 * Others (todos, ask_user, …) are left intact.
 */
export const COMPACTABLE_TOOLS = new Set([
  'read_file',
  'bash',
  'powershell',
  'grep',
  'glob',
  'list_dir',
  'web_search',
  'web_fetch',
  'write_file',
  'search_replace',
  'notebook_edit'
])

function buildToolNameByCallId(messages: ChatMessage[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue
    for (const c of m.tool_calls) {
      map.set(c.id, c.function.name)
    }
  }
  return map
}

/**
 * Shrink old compactable tool outputs. Prefer stable cleared text so repeated
 * microcompact passes do not churn the prompt-cache prefix.
 */
export function microCompactMessages(
  messages: ChatMessage[],
  opts: MicroCompactOpts = {}
): { messages: ChatMessage[]; truncatedCount: number } {
  const keep = opts.keepRecentToolResults ?? DEFAULT_KEEP
  const stableClear = opts.stableClear !== false
  const maxOld = opts.maxOldToolResultChars ?? DEFAULT_MAX_OLD
  const nameById = buildToolNameByCallId(messages)

  const toolIndexes: number[] = []
  messages.forEach((m, i) => {
    if (m.role !== 'tool' || !m.tool_call_id) return
    const name = nameById.get(m.tool_call_id) || m.name || ''
    if (!COMPACTABLE_TOOLS.has(name)) return
    const content = flattenMessageContent(m.content)
    if (content === TOOL_RESULT_CLEARED_MESSAGE) return
    if (content.startsWith('<persisted-output>')) return
    if (stableClear) {
      if (content.length > 0) toolIndexes.push(i)
    } else if (content.length > maxOld) {
      toolIndexes.push(i)
    }
  })

  const protect = new Set(toolIndexes.slice(-keep))
  let truncatedCount = 0
  const next = messages.map((m, i) => {
    if (m.role !== 'tool' || !toolIndexes.includes(i) || protect.has(i)) {
      return m
    }
    truncatedCount += 1
    if (stableClear) {
      return { ...m, content: TOOL_RESULT_CLEARED_MESSAGE }
    }
    const content = flattenMessageContent(m.content)
    return {
      ...m,
      content:
        content.slice(0, maxOld) +
        `\n…[microcompact truncated ${content.length - maxOld} chars; re-read file if needed]`
    }
  })

  const mediaUserIdx: number[] = []
  next.forEach((m, i) => {
    const { images, documents } = countMediaParts(m.content)
    if (m.role === 'user' && images + documents > 0) mediaUserIdx.push(i)
  })
  const keepMedia = new Set(mediaUserIdx.slice(-1))
  const stripped = next.map((m, i) => {
    if (m.role !== 'user' || !mediaUserIdx.includes(i) || keepMedia.has(i)) {
      return m
    }
    return { ...m, content: stripBinaryContentParts(m.content) }
  })

  return { messages: stripped, truncatedCount }
}
