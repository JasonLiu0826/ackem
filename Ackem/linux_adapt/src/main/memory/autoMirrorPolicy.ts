// [autoMirrorPolicy] — 镜中/矛盾自动检测触发策略（FIX-015）

import {
  MIRROR_CHECK_EARLY_MIN_TURNS,
  MIRROR_CHECK_INTERVAL_TURNS,
} from '../engine/ackemParams'

export function evaluatePeriodicMemoryAudit(input: {
  turnsSinceLastCheck: number
  selfFactAddedThisTurn?: boolean
}): boolean {
  const turns = input.turnsSinceLastCheck
  if (turns >= MIRROR_CHECK_INTERVAL_TURNS) return true
  if (input.selfFactAddedThisTurn && turns >= MIRROR_CHECK_EARLY_MIN_TURNS) return true
  return false
}
