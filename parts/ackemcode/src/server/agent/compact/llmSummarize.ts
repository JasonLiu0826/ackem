/**
 * Optional LLM summarization for full compact (CC compactConversation spirit).
 * Falls back to extractive if LLM fails / not configured.
 */
import type { ChatMessage, EffortLevel } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { chatCompletion } from '../llm.js'
import {
  buildExtractiveSummary,
  summaryPassesQualityCheck
} from './summarize.js'

/**
 * R3 contract 1: nine-section structured compaction prompt (own wording — CC
 * services/compact/prompt.ts spirit, not a copy). The section outline matches
 * COMPACT_SUMMARY_SECTIONS in summarize.ts.
 */
const COMPACT_SYSTEM = `You are a context-compaction assistant for a coding agent.
The conversation is being compressed; your summary REPLACES the earlier turns, so anything you omit is lost to the agent. Be factual — never invent tool results or file contents.

Produce EXACTLY these nine numbered sections:
1. Task Intent: what the user is ultimately trying to achieve right now.
2. Technical Approach: the chosen solution/design and why (key decisions, rejected alternatives).
3. Files and Key Sections: every file that was read/edited/created, with the important snippets or line areas and what they contain.
4. Errors and Fixes: each error hit so far and how it was (or wasn't) fixed.
5. All User Requests: a complete list of every explicit user ask, in order.
6. Current State: what has been completed and verified vs. in progress.
7. Next Step: the single most concrete next action the agent should take.
8. Open Questions: unresolved decisions or things awaiting the user.
9. Constraints: rules the user imposed (style, scope, "don't do X"), verbatim where short.

Keep each section tight; prefer bullet lists. If a section truly has nothing, write "(none)". No tools.`

export async function buildLlmSummary(
  head: ChatMessage[],
  opts: {
    apiBaseUrl: string
    apiKey: string
    model: string
    effort?: EffortLevel
    signal?: AbortSignal
  }
): Promise<{ summary: string; via: 'llm' | 'extractive' }> {
  const extractive = buildExtractiveSummary(head)
  if (!opts.apiKey?.trim()) {
    return { summary: extractive, via: 'extractive' }
  }

  try {
    // Flatten head into a compact transcript for the summarizer (no tools)
    const transcript = head
      .map((m) => {
        const role = m.role
        let body = flattenMessageContent(m.content)
        if (m.tool_calls?.length) {
          body +=
            '\n[tool_calls: ' +
            m.tool_calls.map((t) => t.function.name).join(', ') +
            ']'
        }
        if (role === 'tool') body = `[tool ${m.name || ''}] ${body}`
        return `${role.toUpperCase()}: ${body.slice(0, 4000)}`
      })
      .join('\n\n')
      .slice(0, 80_000)

    const { message: msg } = await chatCompletion({
      apiBaseUrl: opts.apiBaseUrl,
      apiKey: opts.apiKey,
      model: opts.model,
      effort: opts.effort ?? 'low',
      messages: [
        { role: 'system', content: COMPACT_SYSTEM },
        {
          role: 'user',
          content: `Summarize this coding-agent transcript:\n\n${transcript}`
        }
      ],
      tools: [],
      signal: opts.signal
    })
    const text = flattenMessageContent(msg.content).trim()
    if (text.length < 40) {
      return { summary: extractive, via: 'extractive' }
    }
    // R3 contract 2: degrade to extractive when the LLM summary is missing the
    // "next step" or "files" fields (the two whose loss derails the session).
    if (!summaryPassesQualityCheck(text)) {
      return { summary: extractive, via: 'extractive' }
    }
    return { summary: text, via: 'llm' }
  } catch {
    return { summary: extractive, via: 'extractive' }
  }
}
