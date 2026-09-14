/**
 * Turn control helpers — Claude Code query.ts stop-reason / maxTurns spirit.
 * GM-CORE: normalize end reasons; continue on tool_calls presence (not finish_reason).
 *
 * CC interactive: maxTurns is optional; omit = no cap (query.ts `if (maxTurns && …)`).
 * Ackem: settings.maxTurns is required; 0 / negative = same as CC omit (unlimited).
 * Browser MCP (Playwright Edge) burns one model turn per click — refund those
 * turns up to BROWSER_MCP_TURN_ALLOWANCE so a 18–40 base budget can finish a page.
 */
import type { ChatMessage } from '../../shared/types.js'
import { permissionClass } from '../../shared/permissionClass.js'

/** Extra wall-clock turns allowed when the iteration drove the browser MCP. */
export const BROWSER_MCP_TURN_ALLOWANCE = 40

export function resolveMaxTurns(maxTurns: number | undefined): number {
  if (maxTurns == null || !Number.isFinite(maxTurns) || maxTurns <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.floor(maxTurns)
}

export function resolveTurnHardCap(maxTurns: number | undefined): number {
  const cap = resolveMaxTurns(maxTurns)
  if (!Number.isFinite(cap)) return Number.POSITIVE_INFINITY
  return cap + BROWSER_MCP_TURN_ALLOWANCE
}

export function toolCallsUseBrowserMcp(
  calls: Array<{ function?: { name?: string } }> | undefined
): boolean {
  if (!calls?.length) return false
  return calls.some((c) => permissionClass(String(c.function?.name ?? '')) === 'browser')
}

export function shouldRefundBrowserTurn(opts: {
  usedBrowserMcp: boolean
  turnCap: number
  hardCap: number
}): boolean {
  return (
    opts.usedBrowserMcp &&
    Number.isFinite(opts.turnCap) &&
    opts.turnCap < opts.hardCap
  )
}

/** Stable Host-facing done.error codes (AgentEvent.done.error). */
export type TurnDoneError =
  | 'max_turns'
  | 'aborted'
  | 'aborted_tools'
  | 'prompt_too_long'
  | 'missing_api_key'
  | 'missing_cwd'
  | 'user_prompt_blocked'
  | 'api_retry_exhausted'
  | 'max_output_tokens'
  | string

export const TURN_DONE_ERRORS = {
  maxTurns: 'max_turns',
  aborted: 'aborted',
  abortedTools: 'aborted_tools',
  promptTooLong: 'prompt_too_long',
  missingApiKey: 'missing_api_key',
  missingCwd: 'missing_cwd',
  userPromptBlocked: 'user_prompt_blocked',
  /** R1: LLM API retries (+ optional fallback model) all exhausted. */
  apiRetryExhausted: 'api_retry_exhausted',
  /** R1: assistant hit output-token limit and recovery turn was already spent. */
  maxOutputTokens: 'max_output_tokens',
  /** R7: Stop hook kept blocking past the continuation limit — forced close. */
  stopHookLoop: 'stop_hook_loop',
  /** R7: optional session token budget exceeded (default off). */
  budgetExceeded: 'budget_exceeded'
} as const

/**
 * R7 contract 2: optional token budget (CC maxBudgetUsd spirit, token-based).
 * Off unless set explicitly or via ACKEM_MAX_BUDGET_TOKENS.
 */
export function resolveMaxBudgetTokens(explicit?: number): number | null {
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit)
  }
  const env = Number(process.env.ACKEM_MAX_BUDGET_TOKENS)
  if (Number.isFinite(env) && env > 0) return Math.floor(env)
  return null
}

/**
 * CC: continue the agentic loop when any tool_use arrived — do not trust
 * stop_reason/finish_reason alone (documented unreliable for tool_use).
 */
export function needsToolFollowUp(assistant: ChatMessage | null | undefined): boolean {
  if (!assistant || assistant.role !== 'assistant') return false
  return Array.isArray(assistant.tool_calls) && assistant.tool_calls.length > 0
}

export function buildMaxTurnsRecoveryPrompt(opts: {
  maxTurns: number
  turnsUsed: number
  lastAssistantPreview?: string
}): string {
  const preview = (opts.lastAssistantPreview || '').trim().slice(0, 500)
  return [
    `[System: maxTurns recovery]`,
    `You reached the session turn budget (${opts.turnsUsed}/${opts.maxTurns}).`,
    `You have ONE recovery turn. Prefer a concise final answer or a minimal tool use to finish.`,
    `Do not start a large new exploration. If blocked, state what remains.`,
    preview ? `Last assistant preview:\n${preview}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * After tools on the last budgeted turn: grant one recovery iteration.
 * Returns the turns value to assign before `continue` (so while-loop may run once more).
 */
export function applyMaxTurnsRecovery(opts: {
  turns: number
  maxTurns: number
  recoveryUsed: boolean
}): { grant: boolean; nextTurns: number } {
  if (opts.recoveryUsed) return { grant: false, nextTurns: opts.turns }
  if (opts.turns < opts.maxTurns) return { grant: false, nextTurns: opts.turns }
  // turns === maxTurns after completing tools on the final budgeted turn
  return { grant: true, nextTurns: Math.max(0, opts.maxTurns - 1) }
}

/**
 * R1: the assistant response was cut off by the output-token limit
 * (OpenAI finish_reason === 'length'), and it produced no tool_calls to continue on.
 */
export function isOutputTruncated(assistant: ChatMessage | null | undefined): boolean {
  if (!assistant || assistant.role !== 'assistant') return false
  if (assistant.finishReason !== 'length') return false
  // If tool_calls are present the loop already continues via needsToolFollowUp.
  return !(Array.isArray(assistant.tool_calls) && assistant.tool_calls.length > 0)
}

/** R1: continuation nudge after an output-token truncation (one recovery turn). */
export function buildOutputTruncationRecoveryPrompt(): string {
  return [
    `[System: output-token recovery]`,
    `Your previous response was cut off because it hit the output length limit.`,
    `Continue exactly where you left off. Be concise; do not repeat what you already produced.`
  ].join('\n')
}
