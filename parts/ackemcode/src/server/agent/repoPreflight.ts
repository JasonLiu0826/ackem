/**
 * N1 — optional warn/block when assistant claims done while diagnostics are open.
 */
import type { AckemCodeSettings } from '../../shared/types.js'
import type { ChatMessage } from '../../shared/types.js'
import { flattenMessageContent } from '../../shared/messageContent.js'

export type RepoPreflightMode = 'off' | 'warn' | 'block'

const DONE_PHRASE =
  /(\已完成|完成了|任务完成|搞定了|all done|done here|PR ready|pull request ready|implementation complete)/i

export function resolveRepoPreflightMode(
  settings?: Pick<AckemCodeSettings, 'repoPreflight'>
): RepoPreflightMode {
  const env = process.env.ACKEM_REPO_PREFLIGHT?.trim().toLowerCase()
  if (env === 'off' || env === 'warn' || env === 'block') return env
  const s = settings?.repoPreflight
  if (s === 'off' || s === 'warn' || s === 'block') return s
  return 'warn'
}

export function sessionHasOpenDiagnostics(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'user') continue
    const body = flattenMessageContent(m.content)
    if (
      !body.includes('[command_diagnostics]') &&
      !body.includes('[lsp_diagnostics]')
    ) {
      continue
    }
    if (
      /error TS\d+|AssertionError|\bFAIL\b|✕|×|\[error\]/i.test(body) ||
      /\berror\b/i.test(body)
    ) {
      return true
    }
  }
  return false
}

export function assistantClaimsDone(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return DONE_PHRASE.test(t)
}

/** User message to inject before ending turn, or null. */
export function buildRepoPreflightMessage(
  mode: RepoPreflightMode,
  assistantText: string
): string | null {
  if (mode === 'off') return null
  if (!assistantClaimsDone(assistantText)) return null
  const prefix =
    mode === 'block'
      ? '[repo_preflight:block]'
      : '[repo_preflight:warn]'
  return (
    `${prefix} Your reply sounds like the task is complete, but recent command_diagnostics or lsp_diagnostics still show failures.\n` +
    'Before finishing: fix failing tests/lints, run git_snapshot (or /diff) if the repo is git, then summarize what changed.'
  )
}

export function maybeRepoPreflightContinuation(opts: {
  messages: ChatMessage[]
  settings?: AckemCodeSettings
  assistantText: string
}): string | null {
  if (!sessionHasOpenDiagnostics(opts.messages)) return null
  const mode = resolveRepoPreflightMode(opts.settings)
  return buildRepoPreflightMessage(mode, opts.assistantText)
}

export const GIT_SNAPSHOT_NUDGE =
  '[repo_hint] You made several successful file edits this turn — consider running git_snapshot (or /diff) before claiming the task is complete.'

export function shouldGitSnapshotNudge(
  successfulEditsThisTurn: number,
  alreadyNudged: boolean
): boolean {
  return !alreadyNudged && successfulEditsThisTurn >= 3
}
