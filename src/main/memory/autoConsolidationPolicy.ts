// [autoConsolidationPolicy] 鈥?鑷姩璁板繂鏁村悎瑙﹀彂绛栫暐锛團IX-014锛?
// 鑱岃矗锛氱粺涓€ chat/ingest 鐨勬暣鍚堥棿闅斻€佷簨瀹炴暟闂ㄦ涓庢湁鎰忎箟浜嬩欢瀵嗗害鍒ゆ柇

import {
  CONSOLIDATION_INTERVAL_TURNS,
  CONSOLIDATION_MAX_TURNS,
  CONSOLIDATION_MEANINGFUL_DENSITY,
  CONSOLIDATION_MIN_FACTS,
  CONSOLIDATION_MIN_TURNS,
} from '../engine/AckemParams'
import type { MemoryFact, TurnTrace } from '../engine/types'
import type { FactStore } from './factStore'

const MEANINGFUL_L0 = new Set(['vulnerable', 'praise', 'apology', 'hurtful'])

export function countRawActiveFacts(facts: MemoryFact[]): number {
  return facts.filter((f) => !f.factLayer || f.factLayer === 'raw').length
}

export function countRawActiveFactsInStore(factStore: FactStore): number {
  factStore.load()
  return countRawActiveFacts(factStore.listActive())
}

export function evaluateAutoConsolidation(input: {
  turnsSinceConsolidation: number
  rawFactCount: number
  recentTraces?: Pick<TurnTrace, 'l0'>[]
}): boolean {
  if (input.rawFactCount < CONSOLIDATION_MIN_FACTS) return false

  const turns = input.turnsSinceConsolidation
  if (turns < CONSOLIDATION_MIN_TURNS) return false
  if (turns >= CONSOLIDATION_MAX_TURNS) return true
  if (turns >= CONSOLIDATION_INTERVAL_TURNS) return true

  const traces = input.recentTraces ?? []
  if (traces.length >= CONSOLIDATION_MIN_TURNS) {
    const meaningful = traces.filter((t) => MEANINGFUL_L0.has(t.l0.type)).length
    if (meaningful / traces.length > CONSOLIDATION_MEANINGFUL_DENSITY) return true
  }
  return false
}
