// [memoryBinding] 鈥?L4鈫擫1/L2 妗ユ
// 鑱岃矗锛氭儏鎰熶笂涓嬫枃蹇収銆乪ffectiveTrust銆丩1 璁板繂澧炲己
// 杈撳叆锛歀1銆丩2銆丗actStore
// 杈撳嚭锛欵motionalContext銆丮emoryAugmentedL1銆乪ffectiveTrust 鏍囬噺
// 寮曠敤锛?./engine/types, ../engine/AckemParams, ./factStore

import { EFFECTIVE_TRUST_L1_WEIGHT, EFFECTIVE_TRUST_MEM_WEIGHT } from '../engine/AckemParams'
import type { EmotionalContext, L1State, EmotionState } from '../engine/types'
import type { FactStore } from './factStore'

export function captureEmotionalContext(l1: L1State, l2: EmotionState): EmotionalContext {
  return {
    valence: Math.max(-1, Math.min(1, l2.aff / 100)),
    intensity: Math.min(1, (Math.abs(l2.aff) + Math.abs(l2.sec)) / 200),
    relStage: l1.stage,
    trust: l1.trust,
    atmosphere: l1.atmosphere
  }
}

export type MemoryAugmentedL1 = { sharedEventsCount: number }

export function augmentL1FromMemory(l1: L1State, factStore: FactStore): MemoryAugmentedL1 {
  const n = factStore.countSharedBondFacts()
  return { sharedEventsCount: Math.max(l1.sharedEventsCount, n) }
}

export function effectiveTrustForL0(l1: L1State, factStore: FactStore): number {
  const memoir = factStore.computeMemoirTrust()
  const m = memoir ?? l1.trust
  return l1.trust * EFFECTIVE_TRUST_L1_WEIGHT + Math.min(l1.trust, m) * EFFECTIVE_TRUST_MEM_WEIGHT
}
