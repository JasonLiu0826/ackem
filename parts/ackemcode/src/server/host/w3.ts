/**
 * W3 companion-readable summary — Ackem product contract (README §工作记忆).
 * Not Claude Code extractMemories (see src/server/memdir/).
 *
 * S08: evidence.verified requires real verify_delivery / verification agent
 * verdict — not merely "some tool succeeded".
 */
import type { ChatMessage } from '../../shared/types.js'
import type { TodoItem } from '../agent/todos.js'
import {
  canClaimDelivery,
  deliveryBlockReason,
  extractVerifyEvidenceFromHistory,
  type VerifyEvidence
} from '../agent/verification.js'
import { canClaimDeliveryWithPlanGate } from '../agent/verifyPlanExecution.js'

export type W3Status = '进行中' | '已交付' | '卡住'

export type W3Summary = {
  version: 1
  sessionId: string
  cwd: string
  /** One-line task description */
  task: string
  status: W3Status
  deliverables: string[]
  /** Human intent of key diffs — not a full patch */
  diffIntent: string
  openQuestions: string[]
  evidence: {
    verified: boolean
    notes: string
  }
  updatedAt: string
}

const PATH_RE =
  /(?:^|[\s`"'(])((?:[A-Za-z]:)?(?:\.\/|\.\.\/|\/)?[\w./\\-]+\.[A-Za-z0-9]{1,8})/g

function lastAssistantText(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      return m.content.trim()
    }
  }
  return ''
}

function lastUserText(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!
    if (m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
      return m.content.trim()
    }
  }
  return ''
}

function extractPaths(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(PATH_RE)) {
    const p = m[1]!
    if (p.includes('node_modules')) continue
    if (p.length > 180) continue
    found.add(p.replace(/\\/g, '/'))
    if (found.size >= 12) break
  }
  return [...found]
}

function resolveEvidence(
  history: ChatMessage[],
  sessionEvidence?: VerifyEvidence | null,
  opts?: {
    planItemCount?: number
    planVerifyEvidence?: VerifyEvidence | null
  }
): { verified: boolean; notes: string } {
  const fromSession = sessionEvidence
  const fromHistory = extractVerifyEvidenceFromHistory(history)
  const best = fromSession ?? fromHistory
  if (!best) {
    return {
      verified: false,
      notes: deliveryBlockReason(null)
    }
  }
  // R10: when tasks/plan exist, require a PASS plan-verify as well
  const planItemCount = opts?.planItemCount ?? 0
  const verified = canClaimDeliveryWithPlanGate({
    verifyEvidence: best,
    planItemCount,
    planVerifyEvidence: opts?.planVerifyEvidence
  })
  const block = canClaimDelivery(best)
    ? planItemCount > 0 && !canClaimDelivery(opts?.planVerifyEvidence)
      ? 'Plan exists but verify_plan_execution has not PASSed — do not claim delivery.'
      : deliveryBlockReason(best)
    : deliveryBlockReason(best)
  return {
    verified,
    notes: [
      `verdict=${best.verdict}`,
      best.command ? `command=${best.command}` : null,
      best.exitCode != null ? `exitCode=${best.exitCode}` : null,
      best.strategies?.length
        ? `strategies=${best.strategies.join(',')}`
        : null,
      planItemCount > 0
        ? `planItems=${planItemCount} planVerify=${opts?.planVerifyEvidence?.verdict ?? 'missing'}`
        : null,
      block || null,
      best.notes.slice(0, 800)
    ]
      .filter(Boolean)
      .join(' · ')
  }
}

/**
 * Heuristic W3 builder (no LLM required). Host may replace with richer extract later.
 */
export function buildW3Summary(opts: {
  sessionId: string
  cwd: string
  history: ChatMessage[]
  todos?: TodoItem[]
  statusHint?: W3Status
  /** S08: last verify_delivery / verification agent result for this session. */
  verifyEvidence?: VerifyEvidence | null
  /** R10: number of plan/task items (gate when > 0). */
  planItemCount?: number
  /** R10: last verify_plan_execution evidence. */
  planVerifyEvidence?: VerifyEvidence | null
}): W3Summary {
  const user = lastUserText(opts.history)
  const assistant = lastAssistantText(opts.history)
  const todos = opts.todos ?? []
  const openTodos = todos.filter((t) => t.status !== 'completed')
  const evidence = resolveEvidence(opts.history, opts.verifyEvidence, {
    planItemCount: opts.planItemCount,
    planVerifyEvidence: opts.planVerifyEvidence
  })

  let status: W3Status = opts.statusHint ?? '进行中'
  if (!opts.statusHint) {
    if (openTodos.length > 0) status = '进行中'
    else if (/stuck|blocked|无法|缺少|need you|permission/i.test(assistant))
      status = '卡住'
    else if (evidence.verified && assistant) status = '已交付'
    else if (assistant) status = '进行中'
  }

  // Hard gate: never 已交付 without PASS verify evidence (S08 / T11)
  if (status === '已交付' && !evidence.verified) {
    status = '进行中'
  }

  const deliverables = [
    ...extractPaths(assistant),
    ...extractPaths(
      todos
        .filter((t) => t.status === 'completed')
        .map((t) => t.content)
        .join(' ')
    )
  ]
  const uniq = [...new Set(deliverables)].slice(0, 12)

  const openQuestions: string[] = []
  if (openTodos.length) {
    openQuestions.push(
      ...openTodos.slice(0, 5).map((t) => `Todo incomplete: ${t.content}`)
    )
  }
  if (!evidence.verified) {
    openQuestions.push('Verification not PASS — do not treat as delivered.')
  }
  for (const line of assistant.split('\n')) {
    if (/\?$/.test(line.trim()) || /请确认|需要你|should I/i.test(line)) {
      openQuestions.push(line.trim().slice(0, 200))
    }
    if (openQuestions.length >= 8) break
  }

  const task =
    (user.split('\n')[0] || '').slice(0, 160) ||
    (todos[0]?.content ?? '').slice(0, 160) ||
    '(no user task recorded)'

  const diffIntent = assistant
    ? assistant.replace(/\s+/g, ' ').slice(0, 280)
    : 'No assistant summary yet.'

  return {
    version: 1,
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    task,
    status,
    deliverables: uniq,
    diffIntent,
    openQuestions: [...new Set(openQuestions)].slice(0, 8),
    evidence,
    updatedAt: new Date().toISOString()
  }
}
