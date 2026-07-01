import type { L1State, EmotionState } from '../engine/types'

export type RelevanceHint = {
  locale: string
  /** 关系阶段系数：STRANGER=0.8, FAMILIAR=1.0, INTIMATE=1.3 */
  stageMultiplier: number
  /** 情绪波动度 0-1，高波动时情感记忆加权更大 */
  emotionalVolatility: number
  /** 是否优先近期记忆（长对话后半段提升近因权重） */
  favorRecent: boolean
  /** 信任轨迹：declining 时正向记忆优先注入 */
  trustTrajectory: 'building' | 'stable' | 'declining'
}

function inferTrustTrajectory(l1: L1State): 'building' | 'stable' | 'declining' {
  if (l1.rifts > 0 && l1.turnsSinceLastRift < 5) return 'declining'
  if (l1.consecutivePositiveTurns > 8) return 'building'
  return 'stable'
}

/** 计算最近 N 个情感值 (aff) 的波动度 */
function recentAffVolatility(history: number[]): number {
  if (history.length < 3) return 0
  const mean = history.reduce((a, b) => a + b, 0) / history.length
  const variance = history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length
  return Math.min(1, Math.sqrt(variance) / 30) // normalize: stddev 30 → 1.0
}

export function computeRelevanceHint(
  l1: L1State,
  l2: EmotionState,
  turnIndex: number,
  recentAffHistory: number[] = []
): RelevanceHint {
  const stageMultiplier = l1.stage === 'INTIMATE' ? 1.3 : l1.stage === 'FAMILIAR' ? 1.0 : 0.8
  const emotionalVolatility = recentAffVolatility(recentAffHistory)
  const favorRecent = turnIndex > 50 || emotionalVolatility > 0.5
  const trustTrajectory = inferTrustTrajectory(l1)

  return { locale: 'zh', stageMultiplier, emotionalVolatility, favorRecent, trustTrajectory }
}
