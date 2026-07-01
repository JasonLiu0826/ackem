// [factContradictionSampler] — 从存量事实中抽样矛盾候选对（FIX-015）

import {
  CONTRADICTION_MIN_WEIGHT,
  CONTRADICTION_SIMILARITY_THRESHOLD,
  PERIODIC_CONTRADICTION_SAMPLE_PAIRS,
} from '../engine/ackemParams'
import type { MemoryFact } from '../engine/types'
import type { FactStore } from './factStore'

function charJaccard(a: MemoryFact, b: MemoryFact): number {
  const aSet = new Set([...a.subject, ...a.summary])
  const bSet = new Set([...b.subject, ...b.summary])
  let overlap = 0
  for (const ch of aSet) {
    if (bSet.has(ch)) overlap++
  }
  const union = new Set([...aSet, ...bSet])
  return union.size === 0 ? 0 : overlap / union.size
}

/** 按 updatedAt 较新者为 newFact，最多返回 maxPairs 对 */
export function sampleSimilarFactPairs(
  factStore: FactStore,
  maxPairs = PERIODIC_CONTRADICTION_SAMPLE_PAIRS
): Array<{ newFact: MemoryFact; existing: MemoryFact }> {
  factStore.load()
  const active = factStore
    .listActive()
    .filter((f) => f.factLayer !== 'consolidated')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const pairs: Array<{ newFact: MemoryFact; existing: MemoryFact; sim: number }> = []
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      if (a.subcategory !== b.subcategory) continue
      if (a.weight < CONTRADICTION_MIN_WEIGHT || b.weight < CONTRADICTION_MIN_WEIGHT) continue
      const sim = charJaccard(a, b)
      if (sim < CONTRADICTION_SIMILARITY_THRESHOLD) continue
      const [newer, older] =
        new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? [a, b] : [b, a]
      pairs.push({ newFact: newer, existing: older, sim })
    }
  }

  pairs.sort((x, y) => y.sim - x.sim)
  return pairs.slice(0, maxPairs).map(({ newFact, existing }) => ({ newFact, existing }))
}
