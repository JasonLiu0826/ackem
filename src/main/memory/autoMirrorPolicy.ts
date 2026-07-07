// [autoMirrorPolicy] 鈥?闀滀腑/鐭涚浘鑷姩妫€娴嬭Е鍙戠瓥鐣ワ紙FIX-015锛?

import {
  MIRROR_CHECK_EARLY_MIN_TURNS,
  MIRROR_CHECK_INTERVAL_TURNS,
} from '../engine/AckemParams'

export function evaluatePeriodicMemoryAudit(input: {
  turnsSinceLastCheck: number
  selfFactAddedThisTurn?: boolean
}): boolean {
  const turns = input.turnsSinceLastCheck
  if (turns >= MIRROR_CHECK_INTERVAL_TURNS) return true
  if (input.selfFactAddedThisTurn && turns >= MIRROR_CHECK_EARLY_MIN_TURNS) return true
  return false
}
