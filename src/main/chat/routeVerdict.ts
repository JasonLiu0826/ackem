/**
 * Route v2 §6.1 (Codex D1) — mapping and ledger write for the per-turn
 * routing verdict.
 *
 * - The routing layer owns desensitization: layer entries carry rule
 *   identifiers only (routeChannel/routeTrace guarantee no user text).
 * - One verdict per turn, recorded after the final channel decision and
 *   before plan/action/execute. Ledger failure is surfaced through the
 *   existing memory-degradation contract (never fabricated as recorded).
 */

import {
  MemorySystemFactoryNotRegisteredError,
  getMemorySystem
} from '../memory/bootstrap.js'
import type { RouteVerdictEvidence, RouteVerdictLayer } from '../memory/contracts.js'
import type { RouteTrace } from '../channel/routeTrace.js'

export type RouteChannelName = 'chat' | 'plugin' | 'work'

export type RouteVerdictInput = {
  channel: RouteChannelName
  motive: string
  /** Non-route exits (redline / shortcuts / confirm) stamp their own layer. */
  exitRuleId?: string
  pendingConfirm?: string
  planId?: string
  trace?: RouteTrace
}

export function buildRouteVerdictEvidence(input: RouteVerdictInput): RouteVerdictEvidence {
  const layers: RouteVerdictLayer[] = (input.trace?.layers ?? []).map((entry) => ({
    layer: entry.layer,
    ruleId: entry.ruleId,
    evidence: entry.evidence,
    candidateCount: entry.candidateCount,
    ms: entry.ms
  }))
  // Routed exits (`route:*`) already carry their layer entries from the trace;
  // only non-route machinery (redline / confirm / shortcuts) stamps an exit layer.
  if (input.exitRuleId && !input.exitRuleId.startsWith('route:')) {
    layers.push({ layer: exitLayerOf(input.exitRuleId), ruleId: input.exitRuleId, ms: 0 })
  }
  const evidence: RouteVerdictEvidence = {
    finalChannel: input.channel,
    motive: input.motive,
    layers,
    usedClassifier: input.trace?.usedClassifier ?? false
  }
  if (input.trace?.residualOutcome) evidence.residualOutcome = input.trace.residualOutcome
  if (input.pendingConfirm) evidence.pendingConfirm = input.pendingConfirm
  if (input.planId) evidence.planId = input.planId
  return evidence
}

function exitLayerOf(exitRuleId: string): RouteVerdictLayer['layer'] {
  if (exitRuleId.startsWith('redline')) return 'redline'
  if (exitRuleId.startsWith('confirm') || exitRuleId.startsWith('shortcut')) return 'confirm'
  return 'normalize'
}

export type RouteVerdictRecordResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; message: string }
/**
 * Records the verdict. Returns failure instead of throwing; callers surface
 * it through the memory-degradation injection (Codex D1 ledger-failure rule).
 * Sanitization is enforced downstream at the memory write boundary
 * (chatMemoryAdapter, 审计整改 #3 二轮) — this helper is a convenience pass-through.
 */
export function recordRouteVerdict(args: {
  dataRoot: string
  turnId: string
  verdict: RouteVerdictEvidence
}): RouteVerdictRecordResult {
  let memory
  try {
    memory = getMemorySystem(args.dataRoot)
  } catch (e) {
    if (e instanceof MemorySystemFactoryNotRegisteredError) {
      return { ok: false, message: 'memory system unavailable' }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  try {
    const recorded = memory.record({
      kind: 'route.verdict',
      turnId: args.turnId,
      verdict: args.verdict
    })
    if (!recorded.ok) return { ok: false, message: `${recorded.code}: ${recorded.message}` }
    return { ok: true, duplicate: recorded.duplicate }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 整改 #3 三轮 (Codex): normal chat exits surface verdict-ledger failure
 * DETERMINISTICALLY to the user (chat:status), not only via model context.
 * The confirm-card exit already does this; ipc/chat.ts routes both exits
 * through this helper so the behaviour stays symmetric and testable.
 */
export function surfaceVerdictLedgerFailure(
  args: { failed: string | null },
  sink: { pushInjection: (message: string) => void; sendStatus: (message: string) => void }
): void {
  if (!args.failed) return
  const message = `【记忆降级】判决未落账：${args.failed}`
  sink.pushInjection(message)
  sink.sendStatus(message)
}
