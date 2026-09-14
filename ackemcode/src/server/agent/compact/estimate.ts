import type { ChatMessage } from '../../../shared/types.js'
import {
  flattenMessageContent,
  countMediaParts,
  ESTIMATED_TOKENS_PER_IMAGE,
  ESTIMATED_TOKENS_PER_NATIVE_PDF
} from '../../../shared/messageContent.js'

/** Rough token estimate (Claude Code–style chars/4), good enough for thresholds. */
export function estimateTokensForText(text: string | null | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function estimateMessageTokens(msg: ChatMessage): number {
  let n = estimateTokensForText(flattenMessageContent(msg.content))
  const media = countMediaParts(msg.content)
  n += media.images * ESTIMATED_TOKENS_PER_IMAGE
  n += media.documents * ESTIMATED_TOKENS_PER_NATIVE_PDF
  if (msg.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      n += estimateTokensForText(tc.function.name)
      n += estimateTokensForText(tc.function.arguments)
      n += 8
    }
  }
  if (msg.tool_call_id) n += 4
  if (msg.name) n += estimateTokensForText(msg.name)
  return n + 4 // role overhead
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
}
