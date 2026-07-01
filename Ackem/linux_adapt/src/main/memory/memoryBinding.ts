// [memoryBinding] — L4↔L1/L2 桥梁
// 职责：情感上下文快照、effectiveTrust、L1 记忆增强
// 输入：L1、L2、FactStore
// 输出：EmotionalContext、MemoryAugmentedL1、effectiveTrust 标量
// 引用：../engine/types, ../engine/ackemParams, ./factStore

import { EFFECTIVE_TRUST_L1_WEIGHT, EFFECTIVE_TRUST_MEM_WEIGHT } from '../engine/ackemParams'
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
