// [relationship] 鈥?L1 鍏崇郴灞?
// 鑱岃矗锛欶SM銆佷俊浠?瑁傜棔/鍔ㄩ噺/姘旀皼涓庤皟鍒剁郴鏁?
// 杈撳叆锛欵vent銆佷笂涓€甯?L1State
// 杈撳嚭锛歀1State銆丮odulation
// 寮曠敤锛?/AckemParams, ./types

import {
  ATMOSPHERE_COOL_THRESHOLD,
  ATMOSPHERE_WARM_THRESHOLD,
  EXTERNAL_COOL_THRESHOLD,
  EXTERNAL_MOMENTUM_ALPHA,
  EXTERNAL_WARM_THRESHOLD,
  ICE_BREAK_SINCERITY_THRESHOLD,
  ICE_BREAK_TRUST_BONUS,
  ICE_BREAK_TRUST_THRESHOLD,
  MOMENTUM_ALPHA,
  RIFT_HURTFUL_COOLDOWN,
  RIFT_MOD_DECAY_PER_RIFT,
  RIFT_MOD_MIN,
  RIFT_REPAIR_POSITIVE_STREAK,
  STAGE_DOWNGRADE_RIFTS,
  STAGE_DOWNGRADE_TRUST,
  STAGE_INTIMATE_EVENTS,
  STAGE_INTIMATE_TRUST,
  STAGE_WARMUP_TURNS,
  STAGE_WEIGHT_FAMILIAR,
  STAGE_WEIGHT_INTIMATE,
  STAGE_WEIGHT_STRANGER,
  TRUST_APOLOGY,
  TRUST_CASUAL,
  TRUST_COLD,
  TRUST_HURTFUL,
  TRUST_PRAISE,
  TRUST_QUESTION,
  TRUST_TEASE,
  TRUST_VULNERABLE,
  TRUST_MOD_MAX,
  TRUST_MOD_MIN
} from './AckemParams'
import type { Event, ExternalAtmosphere, L1State, Modulation, RelationshipStage } from './types'

const POSITIVE_TYPES = new Set(['praise', 'tease', 'vulnerable', 'apology'])
const NEGATIVE_TYPES = new Set(['cold', 'hurtful'])

function trustDelta(event: Event): number {
  switch (event.type) {
    case 'praise':
      return TRUST_PRAISE
    case 'apology':
      return TRUST_APOLOGY
    case 'vulnerable':
      return TRUST_VULNERABLE
    case 'tease':
      return TRUST_TEASE
    case 'cold':
      return TRUST_COLD
    case 'hurtful':
      return TRUST_HURTFUL
    case 'casual_chat':
      return TRUST_CASUAL
    case 'question':
      return TRUST_QUESTION
    default:
      return 0
  }
}

export function signForMomentum(event: Event): number {
  if (POSITIVE_TYPES.has(event.type)) return 1
  if (NEGATIVE_TYPES.has(event.type)) return -1
  return 0
}

export function computeModulation(l1: L1State): Modulation {
  const trustMod = TRUST_MOD_MIN + (l1.trust / 100) * (TRUST_MOD_MAX - TRUST_MOD_MIN)
  const riftMod = Math.max(RIFT_MOD_MIN, 1 - l1.rifts * RIFT_MOD_DECAY_PER_RIFT)
  let stageWeight = STAGE_WEIGHT_FAMILIAR
  if (l1.stage === 'STRANGER') stageWeight = STAGE_WEIGHT_STRANGER
  if (l1.stage === 'INTIMATE') stageWeight = STAGE_WEIGHT_INTIMATE
  return {
    trustMod,
    riftMod,
    stageWeight,
    atmosphere: l1.atmosphere
  }
}

export function updateExternalAtmosphere(
  sign: number,
  intensity: number,
  prev: ExternalAtmosphere
): ExternalAtmosphere {
  const alpha = EXTERNAL_MOMENTUM_ALPHA
  const delta = (1 - alpha) * intensity * sign
  const level = Math.max(-1, Math.min(1, prev.level * alpha + delta))
  const label: ExternalAtmosphere['label'] =
    level > EXTERNAL_WARM_THRESHOLD ? 'warm' : level < EXTERNAL_COOL_THRESHOLD ? 'cool' : 'neutral'
  return { level, label }
}

function evolveStage(s: L1State): RelationshipStage {
  switch (s.stage) {
    case 'STRANGER':
      if (s.consecutivePositiveTurns > STAGE_WARMUP_TURNS) return 'FAMILIAR'
      break
    case 'FAMILIAR':
      if (s.trust > STAGE_INTIMATE_TRUST && s.sharedEventsCount >= STAGE_INTIMATE_EVENTS) return 'INTIMATE'
      break
    case 'INTIMATE':
      if (s.rifts > STAGE_DOWNGRADE_RIFTS || s.trust < STAGE_DOWNGRADE_TRUST) return 'FAMILIAR'
      break
    default:
      break
  }
  return s.stage
}

function applyIceBreak(event: Event, l1: L1State): { trustBonus: number; forcedAtmosphere?: L1State['atmosphere'] } {
  if (
    event.type === 'apology' &&
    l1.trust <= ICE_BREAK_TRUST_THRESHOLD &&
    event.sincerity >= ICE_BREAK_SINCERITY_THRESHOLD
  ) {
    return { trustBonus: ICE_BREAK_TRUST_BONUS, forcedAtmosphere: 'neutral' }
  }
  return { trustBonus: 0 }
}

export function updateRelationship(event: Event, prev: L1State): L1State {
  if (event.type === 'extreme_redline' || event.isExtremeRedline) {
    return { ...prev }
  }

  let trust = Math.max(0, Math.min(100, prev.trust + trustDelta(event)))

  // P1-2: 鐮村啺 鈥?浣庝俊浠绘椂鐨勬繁搴﹂亾姝夌粫杩囨皵姘涘帇鍒?
  const ice = applyIceBreak(event, { ...prev, trust })
  trust = Math.max(0, Math.min(100, trust + ice.trustBonus))

  let rifts = prev.rifts
  let turnsSinceLastRift = prev.turnsSinceLastRift + 1

  if (event.type === 'hurtful' && prev.turnsSinceLastRift >= RIFT_HURTFUL_COOLDOWN) {
    rifts += 1
    turnsSinceLastRift = 0
  }
  if (
    event.type === 'apology' &&
    rifts > 0 &&
    prev.consecutivePositiveTurns >= RIFT_REPAIR_POSITIVE_STREAK
  ) {
    rifts = Math.max(0, rifts - 1)
  }

  let consecutivePositiveTurns = prev.consecutivePositiveTurns
  if (POSITIVE_TYPES.has(event.type)) consecutivePositiveTurns += 1
  else if (NEGATIVE_TYPES.has(event.type)) consecutivePositiveTurns = 0

  const sign = signForMomentum(event)
  const affection_momentum =
    MOMENTUM_ALPHA * prev.affection_momentum + (1 - MOMENTUM_ALPHA) * event.intensity * sign

  let atmosphere: L1State['atmosphere'] = ice.forcedAtmosphere ?? 'neutral'
  if (!ice.forcedAtmosphere) {
    if (affection_momentum > ATMOSPHERE_WARM_THRESHOLD) atmosphere = 'warm'
    else if (affection_momentum < ATMOSPHERE_COOL_THRESHOLD) atmosphere = 'cool'
  }

  const merged: L1State = {
    ...prev,
    trust,
    rifts,
    consecutivePositiveTurns,
    affection_momentum,
    atmosphere,
    turnsSinceLastRift
  }
  let stage = evolveStage(merged)

  return {
    stage,
    trust,
    rifts,
    affection_momentum,
    atmosphere,
    consecutivePositiveTurns,
    turnsSinceLastRift,
    sharedEventsCount: prev.sharedEventsCount
  }
}
