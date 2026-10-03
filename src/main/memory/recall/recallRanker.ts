import type { RecallItem, RecallQuery } from '../contracts.js'
import { isCrossSessionFact } from '../sessionFacts.js'
import type { MemoryFact } from '../semantic/types.js'
import type { RecallCandidate } from './candidateSources.js'
import { factValidityAt } from './factValidity.js'
import type { RecallIntentKind } from './recallIntent.js'

/** Exact run status beats any lexical/vector-style boost (Task 12). */
export const SCORE_EXACT_OPEN_ACTION = 10_000
export const SCORE_TERMINAL_ACTION = 2_000
export const SCORE_ACTIVE_FACT = 800
export const SCORE_LEXICAL_UNIT = 40
export const SCORE_LEXICAL_CAP = 320
export const SCORE_DISTRACTOR_CEILING = 600

export type RecallRankerPolicy = {
  excludeInactiveFacts: boolean
  excludeCrossSessionFactsForSessionScoped: boolean
  excludeCrossSessionEpisodes: boolean
  capLexicalBelowExactAction: boolean
  /** Anti-regression hook for tests only — production uses evidence_then_id. */
  tieBreak?: 'evidence_then_id' | 'id_only'
}

export const DEFAULT_RECALL_RANKER_POLICY: RecallRankerPolicy = {
  excludeInactiveFacts: true,
  excludeCrossSessionFactsForSessionScoped: true,
  excludeCrossSessionEpisodes: true,
  capLexicalBelowExactAction: true,
  tieBreak: 'evidence_then_id'
}

function isOpenActionStatus(status: string | undefined): boolean {
  return status != null && ['running', 'waiting_permission', 'queued', 'accepted', 'unknown'].includes(status)
}

/** Down-rank obvious lexical spam distractors (same score band, no extra semantics). */
function repetitionNoisePenalty(summary: string): number {
  if (/(.{2})\1{2,}/.test(summary)) return 120
  return 0
}

function factFromCandidate(c: RecallCandidate): Partial<MemoryFact> {
  return {
    sourceSessionId: c.factSessionId,
    status: c.factStatus,
    tier: c.factTier ?? 'archival',
    subcategory: c.factSubcategory ?? '',
    confidence: c.confidence,
    weight: c.factWeight ?? 1
  }
}

function isFactTemporallyValid(c: RecallCandidate, query: RecallQuery): string | null {
  const v = factValidityAt(query, c.factValidFrom, c.factValidTo)
  return v === 'ok' ? null : v
}

export function scoreCandidate(
  c: RecallCandidate,
  intents: RecallIntentKind[],
  policy: RecallRankerPolicy,
  querySessionId: string,
  query: RecallQuery
): { score: number; filtered?: string } {
  if (c.source === 'action') {
    if (intents.includes('task_progress') && c.actionNature === 'work' && isOpenActionStatus(c.actionStatus)) {
      return { score: SCORE_EXACT_OPEN_ACTION + c.lexicalScore * SCORE_LEXICAL_UNIT }
    }
    if (intents.includes('plugin_result') && c.actionNature === 'plugin') {
      const base = isOpenActionStatus(c.actionStatus) ? SCORE_EXACT_OPEN_ACTION : SCORE_TERMINAL_ACTION
      return { score: base + c.lexicalScore * SCORE_LEXICAL_UNIT }
    }
    if (intents.includes('task_progress') || intents.includes('plugin_result')) {
      const base = isOpenActionStatus(c.actionStatus) ? SCORE_EXACT_OPEN_ACTION : SCORE_TERMINAL_ACTION
      return { score: base + c.lexicalScore * SCORE_LEXICAL_UNIT }
    }
    return { score: SCORE_TERMINAL_ACTION + c.lexicalScore * SCORE_LEXICAL_UNIT }
  }

  if (c.source === 'fact') {
    if (policy.excludeInactiveFacts && c.factStatus !== 'active') {
      return { score: 0, filtered: 'fact_not_active' }
    }
    if (c.factSensitivity === 'avoid' && !intents.includes('explicit_recall')) {
      return { score: 0, filtered: 'fact_muted' }
    }
    const validity = isFactTemporallyValid(c, query)
    if (validity) return { score: 0, filtered: validity }

    const sid = querySessionId.trim() || 'default'
    if (
      policy.excludeCrossSessionFactsForSessionScoped &&
      c.factSessionId &&
      c.factSessionId.trim() !== sid &&
      !isCrossSessionFact(factFromCandidate(c) as MemoryFact)
    ) {
      return { score: 0, filtered: 'fact_wrong_session' }
    }
    let score = SCORE_ACTIVE_FACT + Math.min(SCORE_LEXICAL_CAP, c.lexicalScore * SCORE_LEXICAL_UNIT)
    if (policy.capLexicalBelowExactAction) {
      score = Math.min(score, SCORE_DISTRACTOR_CEILING)
    }
    score -= repetitionNoisePenalty(c.text)
    if (intents.includes('user_preference')) score += 120
    return { score }
  }

  if (c.source === 'episode') {
    const sid = querySessionId.trim() || 'default'
    if (
      policy.excludeCrossSessionEpisodes &&
      c.episodeSessionId &&
      c.episodeSessionId.trim() !== sid
    ) {
      return { score: 0, filtered: 'episode_wrong_session' }
    }
    let score = 500 + Math.min(SCORE_LEXICAL_CAP, c.lexicalScore * SCORE_LEXICAL_UNIT)
    if (intents.includes('episode_time')) score += 200
    if (policy.capLexicalBelowExactAction) score = Math.min(score, SCORE_DISTRACTOR_CEILING)
    return { score }
  }

  return { score: c.lexicalScore * SCORE_LEXICAL_UNIT }
}

function compareTieBreak(
  a: RecallCandidate,
  b: RecallCandidate,
  mode: RecallRankerPolicy['tieBreak']
): number {
  if (mode === 'id_only') {
    return a.id.localeCompare(b.id)
  }
  const lex = b.lexicalScore - a.lexicalScore
  if (lex !== 0) return lex
  const aW = a.evidenceSupportingWeight ?? a.evidenceEventIds.length
  const bW = b.evidenceSupportingWeight ?? b.evidenceEventIds.length
  const ev = bW - aW
  if (ev !== 0) return ev
  const dayA = a.evidenceLatestLocalDate ?? ''
  const dayB = b.evidenceLatestLocalDate ?? ''
  const dayCmp = dayB.localeCompare(dayA)
  if (dayCmp !== 0) return dayCmp
  const len = b.text.length - a.text.length
  if (len !== 0) return len
  return b.id.localeCompare(a.id)
}

export function rankCandidates(
  candidates: RecallCandidate[],
  intents: RecallIntentKind[],
  policy: RecallRankerPolicy,
  querySessionId: string,
  query: RecallQuery
): { items: RecallItem[]; filtered: Array<{ id: string; reason: string }> } {
  const filtered: Array<{ id: string; reason: string }> = []
  const scored: RecallItem[] = []
  for (const c of candidates) {
    const { score, filtered: reason } = scoreCandidate(c, intents, policy, querySessionId, query)
    if (reason) {
      filtered.push({ id: c.id, reason })
      continue
    }
    if (score <= 0) continue
    scored.push({
      id: c.id,
      source: c.source,
      text: c.text,
      score,
      confidence: c.confidence,
      evidenceEventIds: c.evidenceEventIds,
      occurredAt: c.occurredAt,
      freshness: c.freshness
    })
  }
  const tieBreak = policy.tieBreak ?? 'evidence_then_id'
  const byId = new Map(candidates.map((c) => [c.id, c]))
  scored.sort((a, b) => {
    const primary = b.score - a.score
    if (primary !== 0) return primary
    const ca = byId.get(a.id)
    const cb = byId.get(b.id)
    if (!ca || !cb) return a.id.localeCompare(b.id)
    return compareTieBreak(ca, cb, tieBreak)
  })
  const seen = new Set<string>()
  const deduped: RecallItem[] = []
  for (const item of scored) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    deduped.push(item)
  }
  return { items: deduped, filtered }
}
