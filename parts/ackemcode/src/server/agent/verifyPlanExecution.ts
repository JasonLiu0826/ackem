/**
 * R10-VERIFYPLAN · Plan execution acceptance (CC VerifyPlanExecutionTool spirit).
 *
 * Compares plan/task items against delivery evidence (task status, command
 * output, file mentions). Frontend + browser MCP → require interaction /
 * screenshot evidence; no browser → PARTIAL (never pretend PASS).
 */
import type { ChatMessage } from '../../shared/types.js'
import type { Task } from './tasks.js'
import {
  canClaimDelivery,
  evidenceFromVerdict,
  type VerifyEvidence,
  type VerifyVerdict
} from './verification.js'
import {
  selectVerifyStrategies,
  type VerifyStrategyContext,
  type VerifyStrategyId
} from './verifyStrategies.js'

export type PlanCheckItem = {
  id: string
  subject: string
  /** pending | in_progress | completed (from TaskStore) or inferred. */
  status?: string
  description?: string
}

export type PlanItemResult = {
  id: string
  subject: string
  verdict: VerifyVerdict
  reason: string
  evidenceHints: string[]
}

export type VerifyPlanExecutionResult = {
  ok: boolean
  verdict: VerifyVerdict
  items: PlanItemResult[]
  strategies: VerifyStrategyId[]
  browserMcpPresent: boolean
  frontendRequiresBrowser: boolean
  evidence: VerifyEvidence
  report: string
}

/** MCP / tool names that count as a browser automation surface. */
const BROWSER_TOOL_RE =
  /(browser|playwright|puppeteer|chromium|screenshot|page_click|page_goto|mcp[_-]?browser|navigate)/i

export function isBrowserToolName(name: string): boolean {
  // Avoid matching plain "chrome" path fragments; require a tool-ish token.
  return BROWSER_TOOL_RE.test(name)
}

export function detectBrowserMcpTools(toolNames: string[]): string[] {
  return toolNames.filter(isBrowserToolName)
}

/** Markers that count as browser interaction / screenshot evidence. */
const BROWSER_EVIDENCE_RE =
  /\b(screenshot|navigate|page\.goto|console\.error|accessibility|clicked|viewport|aria-|domcontentloaded)\b/i

export function historyHasBrowserEvidence(history: ChatMessage[]): boolean {
  for (const m of history) {
    if (typeof m.content === 'string' && BROWSER_EVIDENCE_RE.test(m.content)) {
      return true
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      for (const c of m.tool_calls) {
        if (isBrowserToolName(c.function.name)) return true
        if (BROWSER_EVIDENCE_RE.test(c.function.arguments || '')) return true
      }
    }
  }
  return false
}

export function tasksToPlanItems(tasks: Task[]): PlanCheckItem[] {
  return tasks.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    description: t.description
  }))
}

/** Parse `- [ ]` / `- [x]` markdown checklist lines into plan items. */
export function parsePlanChecklist(markdown: string): PlanCheckItem[] {
  const items: PlanCheckItem[] = []
  const lines = markdown.split(/\r?\n/)
  let n = 0
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s+(.+)$/)
    if (!m) continue
    n += 1
    const done = m[1]!.toLowerCase() === 'x'
    items.push({
      id: `plan-${n}`,
      subject: m[2]!.trim(),
      status: done ? 'completed' : 'pending'
    })
  }
  return items
}

function blobFromHistory(history: ChatMessage[]): string {
  const parts: string[] = []
  for (const m of history) {
    if (typeof m.content === 'string') parts.push(m.content)
    if (m.role === 'tool' && m.name) parts.push(`tool:${m.name}`)
  }
  return parts.join('\n').toLowerCase()
}

function itemEvidenceHints(
  item: PlanCheckItem,
  historyBlob: string,
  changedFiles: string[]
): string[] {
  const hints: string[] = []
  const subject = item.subject.toLowerCase()
  const tokens = subject
    .split(/[^a-z0-9_./\\-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
  for (const t of tokens.slice(0, 8)) {
    if (historyBlob.includes(t.toLowerCase())) {
      hints.push(`transcript mentions "${t}"`)
    }
    if (
      changedFiles.some((f) =>
        f.toLowerCase().replace(/\\/g, '/').includes(t.toLowerCase())
      )
    ) {
      hints.push(`changed file matches "${t}"`)
    }
  }
  if (item.status === 'completed') hints.push('task status=completed')
  return [...new Set(hints)]
}

function verdictForItem(
  item: PlanCheckItem,
  hints: string[]
): { verdict: VerifyVerdict; reason: string } {
  if (item.status === 'completed' && hints.length > 0) {
    return {
      verdict: 'PASS',
      reason: `Completed with supporting evidence (${hints.length} hint(s)).`
    }
  }
  if (item.status === 'completed' && hints.length === 0) {
    return {
      verdict: 'PARTIAL',
      reason:
        'Marked completed but no transcript/file evidence linked to this item.'
    }
  }
  if (item.status === 'in_progress') {
    return {
      verdict: 'PARTIAL',
      reason: 'Still in_progress — not fully delivered.'
    }
  }
  if (hints.length > 0) {
    return {
      verdict: 'PARTIAL',
      reason: 'Some evidence found but task not marked completed.'
    }
  }
  return {
    verdict: 'FAIL',
    reason: 'No completion status and no matching evidence.'
  }
}

function aggregate(items: PlanItemResult[]): VerifyVerdict {
  if (!items.length) return 'PARTIAL'
  if (items.some((i) => i.verdict === 'FAIL')) return 'FAIL'
  if (items.every((i) => i.verdict === 'PASS')) return 'PASS'
  return 'PARTIAL'
}

/**
 * Contract 1: evaluate plan/tasks against evidence.
 * Contract 3: frontend + browser MCP → require interaction/screenshot evidence;
 * frontend without browser → force PARTIAL (never fake PASS).
 */
export function runVerifyPlanExecution(opts: {
  items: PlanCheckItem[]
  history?: ChatMessage[]
  changedFiles?: string[]
  mcpToolNames?: string[]
  strategyCtx?: VerifyStrategyContext
  /** Explicit: caller already collected browser evidence this turn. */
  browserEvidencePresent?: boolean
}): VerifyPlanExecutionResult {
  const history = opts.history ?? []
  const changedFiles = opts.changedFiles ?? []
  const historyBlob = blobFromHistory(history)
  const strategies = selectVerifyStrategies({
    ...opts.strategyCtx,
    changedFiles: opts.strategyCtx?.changedFiles ?? changedFiles,
    taskSummary:
      opts.strategyCtx?.taskSummary ??
      opts.items.map((i) => i.subject).join('; ')
  })

  const browserTools = detectBrowserMcpTools(opts.mcpToolNames ?? [])
  const browserMcpPresent = browserTools.length > 0
  const frontendRequiresBrowser = strategies.includes('frontend')
  const hasBrowserEvidence =
    opts.browserEvidencePresent === true || historyHasBrowserEvidence(history)

  const items: PlanItemResult[] = opts.items.map((item) => {
    const hints = itemEvidenceHints(item, historyBlob, changedFiles)
    const { verdict, reason } = verdictForItem(item, hints)
    return {
      id: item.id,
      subject: item.subject,
      verdict,
      reason,
      evidenceHints: hints
    }
  })

  let verdict = aggregate(items)
  const notes: string[] = []

  if (!opts.items.length) {
    verdict = 'PARTIAL'
    notes.push(
      'No plan items / tasks provided — cannot claim plan execution PASS.'
    )
  }

  // Contract 3: frontend strategy browser evidence gate
  if (frontendRequiresBrowser) {
    if (browserMcpPresent && !hasBrowserEvidence) {
      if (verdict === 'PASS') verdict = 'PARTIAL'
      notes.push(
        `Frontend strategy active and browser MCP tools present (${browserTools.slice(0, 5).join(', ')}), but no interaction/screenshot evidence found — downgraded to PARTIAL.`
      )
    } else if (!browserMcpPresent) {
      if (verdict === 'PASS') verdict = 'PARTIAL'
      notes.push(
        'Frontend strategy active but no browser MCP tools available — cannot fully verify UI interactions; VERDICT cannot be PASS (PARTIAL).'
      )
    } else {
      notes.push('Frontend browser evidence present — UI checks credited.')
    }
  }

  const reportLines = [
    '# Plan execution verification',
    `strategies: ${strategies.join(', ')}`,
    `browserMcp: ${browserMcpPresent ? 'yes' : 'no'}`,
    '',
    ...items.map(
      (i) =>
        `### Item ${i.id}: ${i.subject}\n**Result: ${i.verdict}**\n${i.reason}` +
        (i.evidenceHints.length
          ? `\nEvidence: ${i.evidenceHints.join('; ')}`
          : '')
    ),
    '',
    ...notes.map((n) => `> ${n}`),
    '',
    `VERDICT: ${verdict}`
  ]
  const report = reportLines.join('\n')

  const evidence = evidenceFromVerdict(verdict, report, {
    strategies,
    checkCount: items.length,
    checksWithCommand: items.filter((i) => i.evidenceHints.length > 0).length
  })

  return {
    ok: verdict === 'PASS',
    verdict,
    items,
    strategies,
    browserMcpPresent,
    frontendRequiresBrowser,
    evidence,
    report
  }
}

/**
 * Contract 2: when a plan (tasks) exists, delivery requires a PASS plan-verify
 * in addition to ordinary verify evidence.
 */
export function canClaimDeliveryWithPlanGate(opts: {
  verifyEvidence: VerifyEvidence | null | undefined
  planItemCount: number
  planVerifyEvidence: VerifyEvidence | null | undefined
}): boolean {
  if (opts.planItemCount > 0) {
    if (!canClaimDelivery(opts.planVerifyEvidence)) return false
  }
  return canClaimDelivery(opts.verifyEvidence)
}
