import { FACT_DEDUP_THRESHOLD, FACT_DEDUP_WEIGHT_BOOST, CORE_MEMORY_WEIGHT_THRESHOLD } from '../../engine/ackemParams.js'
import type { EmotionalContext } from '../../engine/types.js'
import type { MemoryFact } from './types.js'
import { normalizeConfidence } from '../../../shared/confidence.js'
import { CATEGORY_META, type Subcategory, isValidSubcategory } from '../taxonomy.js'

export type FactMergeCandidate = {
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  triggers?: string[]
  emotionalContext: EmotionalContext
  privacyLevel?: MemoryFact['privacyLevel']
  ownerAgentId?: string
}

export type FactMergeDecision =
  | { action: 'insert' }
  | {
      action: 'update'
      targetId: string
      patch: Pick<
        MemoryFact,
        'weight' | 'confidence' | 'triggers' | 'summary' | 'emotionalContext' | 'privacyLevel' | 'updatedAt' | 'updateTrail' | 'tier'
      >
    }

function charSet(s: string): Set<string> {
  const set = new Set<string>()
  for (const ch of s.toLowerCase()) {
    if (ch !== ' ') set.add(ch)
  }
  return set
}

function jaccardSimilarity(a: string, b: string): number {
  const qSet = charSet(a)
  const fSet = charSet(b)
  if (qSet.size < 2 || fSet.size < 2) return 0
  let intersect = 0
  for (const ch of qSet) {
    if (fSet.has(ch)) intersect++
  }
  const union = new Set([...qSet, ...fSet])
  return intersect / union.size
}

function mostRestrictivePrivacy(
  a?: MemoryFact['privacyLevel'],
  b?: MemoryFact['privacyLevel']
): MemoryFact['privacyLevel'] {
  const rank = { normal: 0, intimate: 1, explicit: 2 } as const
  const aa = a ?? 'normal'
  const bb = b ?? 'normal'
  return rank[bb] > rank[aa] ? bb : aa
}

/** Pure merge/dedupe policy (no DB, no embedding I/O). */
export function evaluateFactMerge(
  activeFacts: MemoryFact[],
  candidate: FactMergeCandidate,
  opts?: { ownerAgentId?: string; jaccardThreshold?: number }
): FactMergeDecision {
  const sub = candidate.subcategory as Subcategory
  const meta = isValidSubcategory(sub) ? CATEGORY_META[sub] : CATEGORY_META.MOOD
  const incomingConfidence = normalizeConfidence(candidate.confidence ?? meta.defaultConfidence)
  const owner = opts?.ownerAgentId?.trim()
  const threshold = opts?.jaccardThreshold ?? FACT_DEDUP_THRESHOLD

  let best: MemoryFact | null = null
  let bestSim = 0
  const queryText = `${candidate.subject} ${candidate.summary}`

  for (const f of activeFacts) {
    if (f.status !== 'active' || f.subcategory !== candidate.subcategory) continue
    if (f.domain !== candidate.domain) continue
    if (owner) {
      const factOwner = f.ownerAgentId ?? 'default'
      if (owner === 'default') {
        if (factOwner !== 'default') continue
      } else if (factOwner !== owner) {
        continue
      }
    }
    const sim = jaccardSimilarity(queryText, `${f.subject} ${f.summary}`)
    if (sim >= threshold && sim > bestSim) {
      best = f
      bestSim = sim
    }
  }

  if (!best) return { action: 'insert' }

  const now = new Date().toISOString()
  const weight = Math.max(best.weight, candidate.weight ?? meta.defaultWeight) + FACT_DEDUP_WEIGHT_BOOST
  let tier = best.tier
  if (tier !== 'core' && weight >= CORE_MEMORY_WEIGHT_THRESHOLD) {
    tier = 'core'
  }
  const summary =
    candidate.summary.length > best.summary.length ? candidate.summary : best.summary
  return {
    action: 'update',
    targetId: best.id,
    patch: {
      weight,
      confidence: Math.max(normalizeConfidence(best.confidence), incomingConfidence),
      triggers: [...new Set([...best.triggers, ...(candidate.triggers ?? [])])],
      summary,
      emotionalContext: candidate.emotionalContext,
      privacyLevel: mostRestrictivePrivacy(best.privacyLevel, candidate.privacyLevel),
      updatedAt: now,
      updateTrail: [...best.updateTrail, now],
      tier
    }
  }
}
