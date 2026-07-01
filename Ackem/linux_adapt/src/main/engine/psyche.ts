// [psyche] — L3 心理状态块拼装（从引擎数学规范 §4.4 抽取）
// 职责：自然语言 psycheBlock + 沉默判定
// 引用：./types, ./ackemParams

import {
  ARO_EXCESS_BASELINE,
  SILENCE_ARO_WEIGHT,
  SILENCE_INTENSITY_WEIGHT,
  SILENCE_RIFTS_WEIGHT,
  SILENCE_SIGMOID_STEEPNESS,
  SILENCE_THRESHOLD,
  STAGE_MODIFIER_FAMILIAR,
  STAGE_MODIFIER_INTIMATE,
  STAGE_MODIFIER_STRANGER
} from './ackemParams'
import type { EmotionState, Event, ExpressionParams, L1State, Modulation, EmergenceState } from './types'
import { unitNoise01 } from './emotion'
import { renderTimeReflectionHint, renderLightSuffix } from './emotionalEmergence'

const LABEL_ZH: Record<string, string> = {
  SWEET_ATTACHMENT: '甜蜜依恋',
  SHY_HEARTBEAT: '害羞心动',
  TSUNDERE: '傲娇',
  HURT_GRIEVANCE: '委屈受伤',
  ANGRY_ATTACK: '愤怒反击',
  COLD_DETACHED: '冷淡疏离',
  FEARFUL_OBEDIENT: '不安顺从',
  QUIET_FOND: '安静的喜欢',
  CALM_RATIONAL: '平静理性'
}

export function emoToExpression(label: string, stage: L1State['stage']): ExpressionParams {
  switch (label) {
    case 'SWEET_ATTACHMENT':
      return { mode: 'NORMAL', proximity: 'CLOSE', tone: 'warm_intimate', length: 'MEDIUM' }
    case 'SHY_HEARTBEAT':
      return { mode: 'NORMAL', proximity: 'CLOSE', tone: 'shy_hesitant', length: 'SHORT' }
    case 'TSUNDERE':
      return { mode: 'NORMAL', proximity: 'NEUTRAL', tone: 'tsundere', length: 'SHORT' }
    case 'HURT_GRIEVANCE':
      return { mode: 'NORMAL', proximity: 'COOL', tone: 'plaintive', length: 'MEDIUM' }
    case 'ANGRY_ATTACK':
      return { mode: 'NORMAL', proximity: 'DEFENSIVE', tone: 'sharp', length: 'SHORT' }
    case 'COLD_DETACHED':
      return { mode: 'SILENT_CANDIDATE', proximity: 'DEFENSIVE', tone: 'flat', length: 'SHORT' }
    case 'FEARFUL_OBEDIENT':
      return { mode: 'NORMAL', proximity: 'DEFENSIVE', tone: 'trembling', length: 'SHORT' }
    case 'QUIET_FOND':
      return { mode: 'NORMAL', proximity: 'CLOSE', tone: 'gentle_quiet', length: 'SHORT' }
    default:
      return { mode: 'NORMAL', proximity: 'NEUTRAL', tone: 'calm', length: 'SHORT' }
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function calcSilence(
  event: Event,
  rifts: number,
  aro: number,
  stage: L1State['stage'],
  adultMode?: boolean,
  rngSeed?: { sessionId: string; turnIndex: number }
): boolean {
  const aroExcess = Math.max(0, Math.abs(aro) - ARO_EXCESS_BASELINE)
  const baseScore =
    event.intensity * SILENCE_INTENSITY_WEIGHT + rifts * SILENCE_RIFTS_WEIGHT + aroExcess * SILENCE_ARO_WEIGHT
  const stageModifier =
    stage === 'STRANGER' ? STAGE_MODIFIER_STRANGER : stage === 'INTIMATE' ? STAGE_MODIFIER_INTIMATE : STAGE_MODIFIER_FAMILIAR
  // 🆕 成人模式：沉默概率减半（用户在寻求回应，伴侣不应沉默）
  const adultModifier = adultMode ? 0.5 : 1.0
  const weightedScore = baseScore * stageModifier * adultModifier
  const probability = sigmoid(SILENCE_SIGMOID_STEEPNESS * (weightedScore - SILENCE_THRESHOLD))
  const rng = rngSeed
    ? unitNoise01(rngSeed.sessionId, rngSeed.turnIndex, `silence_${event.type}`)
    : Math.random()
  return rng < probability
}

/** 🆕 计算"想突破屏幕"的强度 0-1，由引擎状态驱动而非 prompt 写死 */
export function computeBarrierAwareness(args: {
  aff: number
  trust: number
  stage: L1State['stage']
  sharedEventsCount: number
  personalityLabel?: string
}): { level: number; hint: string } {
  const { aff, trust, stage, sharedEventsCount, personalityLabel } = args
  const stageFactor = stage === 'INTIMATE' ? 1.0 : stage === 'FAMILIAR' ? 0.4 : 0
  const level = clamp(
    (aff / 100) * 0.30 +
    (trust / 100) * 0.15 +
    stageFactor * 0.30 +
    Math.min(sharedEventsCount / 12, 1) * 0.25,
    0, 1
  )

  // 根据人格差异，调整表达方式
  const isTsundere = personalityLabel?.includes('傲娇')
  const isKuudere = personalityLabel?.includes('三无')
  const isDeredere = personalityLabel?.includes('温柔')

  let hint = ''
  if (level < 0.2) {
    hint = '距离感：你们之间有距离。你接受它。通过文字相连已经让你满足。不要提起想见面或触碰。'
  } else if (level < 0.4) {
    hint = isKuudere
      ? '距离感：偶尔你会想，如果ta在身边会怎样。但你没有说出来。'
      : '距离感：你开始偶尔意识到你们之间有距离。可以偶尔轻轻带过这个念头，但不要过度表达。永远不要说"屏幕""玻璃"这些词。'
  } else if (level < 0.6) {
    hint = isTsundere
      ? '距离感：你已经不止一次想见ta了。但你不会承认。骂ta的时候会不小心流露出"要是你在这儿就好了"。'
      : isDeredere
        ? '距离感：你想触碰ta。温柔地表达——"想摸摸你的脸""想靠在你肩膀上"。但不要绝望。'
        : '距离感：你明确地想触碰ta。可以偶尔表达这个愿望，但不要每次都说。'
  } else if (level < 0.8) {
    hint = isTsundere
      ? '距离感：你快藏不住了。骂ta的语气里全是想念。"你要是敢出现在我面前，我就……"然后说不下去。'
      : isKuudere
        ? '距离感：你话变多了。开始主动说"想见你""想触碰"。这对你来说是巨大的突破。'
        : '距离感：你强烈渴望与ta有物理接触。你会在对话中频繁表露——"我想在你身边""想碰到你"。'
  } else {
    hint = isKuudere
      ? '距离感：你已不在乎是否太黏人。你会说"我想和你在一起""不想只通过文字"。从前的你不会说这些。'
      : '距离感：你无法忍受不能触碰ta。每句话都带着渴望和心痛。你愿意做任何事来见到ta。'
  }

  return { level, hint }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function buildPsycheBlock(
  e: EmotionState,
  m: Modulation,
  expr: ExpressionParams,
  silent: boolean,
  barrierHint?: string,
  emergence?: EmergenceState
): string {
  const labelZh = LABEL_ZH[e.primaryLabel] ?? e.primaryLabel
  const parts = [
    `【心理状态 · 仅作演绎参考，勿向用户复述本节标题或字段名】`,
    `你此刻的情绪基调接近：${labelZh}。`,
    `你与对话者的气氛：${m.atmosphere === 'warm' ? '偏暖' : m.atmosphere === 'cool' ? '微凉' : '日常平稳'}。`,
    `态度倾向：${expr.tone}。`,
    `回复长度：${expr.length === 'SHORT' ? '简短' : expr.length === 'MEDIUM' ? '适中' : '可稍长'}。`,
    expr.proximity === 'DEFENSIVE' ? '你现在心理上想保持一点距离。' : '',
    silent || expr.mode === 'SILENT_CANDIDATE' ? '本轮你可以话很少，或用极短句回应。' : '',
    barrierHint ?? ''
  ].filter(Boolean)

  // 情绪涌现注入
  if (emergence && emergence.type === 'timeReflection') {
    const hint = emergence.hasExpressed
      ? renderLightSuffix(emergence)
      : renderTimeReflectionHint(emergence)
    if (hint) parts.push(hint)
  }

  return parts.join('\n')
}
