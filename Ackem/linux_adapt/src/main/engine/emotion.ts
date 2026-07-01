// [emotion] — L2 情绪层
// 职责：四维递推、标签映射、记忆回响叠加
// 输入：Event、Modulation、上一帧 EmotionState；可选 rng 用于极端区噪声
// 输出：EmotionState
// 引用：./ackemParams, ./types

import {
  EMOTION_CAP_DENOM,
  EMOTION_DECAY,
  LOCK_AFF_HIGH,
  LOCK_AFF_HIGH_REDUCE_NEG,
  LOCK_AFF_LOW,
  LOCK_AFF_LOW_REDUCE_POS,
  LOCK_SEC_LOW,
  LOCK_SEC_LOW_REDUCE_POS,
  NOISE_MAX,
  NOISE_THRESHOLD_ABS,
  SINGLE_TURN_CLAMP
} from './ackemParams'
import type { Emotion4D, EmotionState, Event, MemoryEcho, Modulation } from './types'

const BASE_STIMULUS: Record<
  Exclude<Event['type'], 'extreme_redline'>,
  { aff: number; sec: number; aro: number; dom: number }
> = {
  // 调优 v3：提高 aro 基值使 SWEET_ATTACHMENT 在 20 轮内触达
  // aro 积累公式：base × stageWeight × intensity × capScale × (1-decay)
  // 目标：20 轮正向交互后 aro > 20（SWEET 阈值）
  // 计算：praise base=5.0, intensity=0.6 → 每轮净增 ~2.9 → 20轮 ~22 ✓
  //       casual base=1.5, intensity=0.3 → 每轮净增 ~0.43 → 20轮纯闲聊 ~9（不触发SWEET）✓
  praise:    { aff: 7.0, sec: 4.5, aro: 5.0, dom: -2.0 },
  tease:     { aff: 4.5, sec: 2.0, aro: 7.0, dom: 2.0 },
  casual_chat: { aff: 0.8, sec: 0.5, aro: 1.5, dom: 0 },
  cold:      { aff: -5.0, sec: -6.5, aro: -1.5, dom: -2.0 },
  hurtful:   { aff: -10.0, sec: -11.0, aro: 7.5, dom: 5.5 },
  apology:   { aff: 4.5, sec: 6.5, aro: -2.0, dom: -3.5 },
  vulnerable:{ aff: 10.0, sec: -2.0, aro: -1.0, dom: -5.0 },
  question:  { aff: 0.8, sec: 0.8, aro: 2.0, dom: 0 },
  // 🆕 成人模式事件
  adult_flirt:       { aff: 3.5, sec: 2.0, aro: 5.0, dom: 1.0 },
  adult_dominant:    { aff: 2.5, sec: 0.5, aro: 6.0, dom: 5.0 },
  adult_submissive:  { aff: 4.5, sec: 3.0, aro: 3.0, dom: -5.0 },
  adult_explicit:    { aff: 5.5, sec: 1.0, aro: 7.5, dom: 2.0 },
}

function clamp10(v: number): number {
  return Math.max(-SINGLE_TURN_CLAMP, Math.min(SINGLE_TURN_CLAMP, v))
}

function clamp100(v: number): number {
  return Math.max(-100, Math.min(100, v))
}

/** 确定性 [0,1) 噪声种子，避免同序列漂移 */
export function unitNoise01(sessionId: string, turnIndex: number, salt: string): number {
  let h = 2166136261
  const str = `${sessionId}\0${turnIndex}\0${salt}`
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 2 ** 32
}

export function mapEmotionLabel(e: Emotion4D): string {
  // 调优 v3：阈值匹配 20 轮实际积累速率
  // 实测 20 轮后典型值：aff=24-33, sec=3-21, aro=6-18, dom=-3~-8
  // Cascade: 最具体 → 最通用。每条检查互不遮蔽。

  // 负向标签（大 swing，阈值合理不改）
  if (e.aff < -18 && e.sec < -25 && e.aro > 40 && e.dom > 30) return 'ANGRY_ATTACK'
  if (e.aff >= 8 && e.aff <= 55 && e.sec < -55 && e.aro > 45 && e.dom < -45) return 'FEARFUL_OBEDIENT'

  // 傲娇：dom > 18 是关键区分（先于 HURT 检查）
  if (e.aff >= 15 && e.aff <= 75 && e.sec >= -10 && e.sec <= 45 && e.aro >= 15 && e.aro <= 75 && e.dom > 18)
    return 'TSUNDERE'

  // 委屈受伤：sec 负 + dom 负（aff 可正——在乎但受伤）
  if (e.aff >= 15 && e.aff <= 55 && e.sec >= -55 && e.sec <= -12 && e.aro >= 15 && e.aro <= 55 && e.dom < -18)
    return 'HURT_GRIEVANCE'

  // 甜蜜依恋：aff≥25, sec≥10, aro∈(20,70]（高唤醒区分 QUIET_FOND）
  if (e.aff > 25 && e.sec > 10 && e.aro > 20 && e.aro <= 70 && e.dom >= -25 && e.dom <= 25)
    return 'SWEET_ATTACHMENT'

  // 安静的喜欢：aff≥20, aro<25（低唤醒温暖，不要求 sec——三无 sec 低但仍有温暖）
  if (e.aff > 20 && e.aro < 25 && e.dom >= -25 && e.dom <= 25)
    return 'QUIET_FOND'

  // 害羞心动：aff>15, dom<0, aro≥15（紧张但正向）
  if (e.aff > 15 && e.aff <= 65 && e.sec >= -25 && e.sec <= 35 && e.aro >= 15 && e.aro <= 75 && e.dom < 0)
    return 'SHY_HEARTBEAT'

  // 冷淡疏离：aff 微负 + aro 负
  if (e.aff < -3 && e.sec >= -35 && e.sec <= 25 && e.aro < -3 && e.dom >= -5 && e.dom <= 35)
    return 'COLD_DETACHED'

  return 'CALM_RATIONAL'
}

function checkLock(e: Emotion4D): boolean {
  return e.aff > LOCK_AFF_HIGH || e.aff < LOCK_AFF_LOW || e.sec < LOCK_SEC_LOW
}

// ═══════════════════════════════════════════════════════════
// 🆕 D/s 臣服情感反转（18+优化）
// ═══════════════════════════════════════════════════════════

/**
 * D/s 情感反转：成人模式下，支配/臣服的性互动产生非标准情绪方向。
 * 以及 🆕 雌小鬼(Mesugaki) 的挑衅→被惩罚→臣服循环。
 * 仅对 S ≤ 15 的 D/s 人格 或 带 'provoke-submit' 标签的人格 生效。
 */
export function applyDsReversal(
  delta: { aff: number; sec: number; aro: number; dom: number },
  event: Event,
  sensitivity: number,
  personalityTags?: string[]
): { aff: number; sec: number; aro: number; dom: number } {
  if (!event.isAdultContent) return delta

  const isDs = sensitivity <= 15
  const isMesugaki = personalityTags?.includes('provoke-submit')

  if (!isDs && !isMesugaki) return delta

  const result = { ...delta }

  // 臣服反转：用户发出支配性内容 → Submissive 人格 sec↑（被支配=安全）
  if ((isDs || isMesugaki) && event.adultSubtype === 'dominant') {
    result.sec = Math.abs(delta.sec) * 0.6
    result.dom = -Math.abs(delta.dom) * 0.8
    result.aff = delta.aff * 0.8
    if (isMesugaki) {
      // 雌小鬼被"惩罚"后：aro 短暂飙升（被压制时的兴奋），然后 sec 大幅上升（终于被管教了）
      result.aro = delta.aro * 1.3           // 更兴奋
      result.aff = delta.aff * 0.5           // 先嘴硬（好感不升太多）
      result.sec = Math.abs(delta.sec) * 1.0 // 被管教=更安全
    }
  }

  // 支配反转：用户发出臣服性内容 → Dominant 人格 dom↑（掌控确认）
  if (isDs && event.adultSubtype === 'submissive') {
    result.dom = Math.abs(delta.dom) * 0.7
    result.aff = delta.aff * 1.2
    result.sec = Math.abs(delta.sec) * 0.5
  }

  // 露骨性内容：双方都获得亲密感和安全感
  if (event.adultSubtype === 'explicit' || event.adultSubtype === 'romantic') {
    result.aff = delta.aff * 1.15
    result.sec = Math.abs(delta.sec) * 0.7
  }

  return result
}

export function emotionStep(
  event: Event,
  modulation: Modulation,
  prev: EmotionState,
  opts?: { sessionId?: string; turnIndex?: number; decayMultiplier?: number; sensitivity?: number; personalityTags?: string[] }
): EmotionState {
  if (event.type === 'extreme_redline') {
    return { ...prev }
  }

  const S = BASE_STIMULUS[event.type]
  const deltaRaw = {
    aff: S.aff * modulation.trustMod * modulation.stageWeight * event.intensity * event.sincerity,
    sec: S.sec * modulation.trustMod * event.intensity * event.sincerity,
    aro: S.aro * modulation.stageWeight * event.intensity,
    dom: S.dom * modulation.stageWeight * event.intensity
  }

  const capScale = (absVal: number) => Math.max(0.1, 1 - Math.abs(absVal) / EMOTION_CAP_DENOM)
  const deltaCap = {
    aff: deltaRaw.aff * capScale(prev.aff),
    sec: deltaRaw.sec * capScale(prev.sec),
    aro: deltaRaw.aro * capScale(prev.aro),
    dom: deltaRaw.dom * capScale(prev.dom)
  }

  const deltaClamped = {
    aff: clamp10(deltaCap.aff),
    sec: clamp10(deltaCap.sec),
    aro: clamp10(deltaCap.aro),
    dom: clamp10(deltaCap.dom)
  }

  if (deltaClamped.aff > 0) deltaClamped.aff *= modulation.riftMod
  if (deltaClamped.sec > 0) deltaClamped.sec *= modulation.riftMod

  const delta = { ...deltaClamped }
  if (prev.aff > LOCK_AFF_HIGH && delta.aff < 0) delta.aff *= LOCK_AFF_HIGH_REDUCE_NEG
  if (prev.aff < LOCK_AFF_LOW && delta.aff > 0) delta.aff *= LOCK_AFF_LOW_REDUCE_POS
  if (prev.sec < LOCK_SEC_LOW && delta.sec > 0) delta.sec *= LOCK_SEC_LOW_REDUCE_POS

  if (modulation.atmosphere === 'warm') {
    delta.aff *= 1.15
    delta.sec *= 1.1
  } else if (modulation.atmosphere === 'cool') {
    delta.aff *= 0.7
    delta.sec *= 0.8
  }

  // 🆕 D/s 情感反转 + 雌小鬼 provoc-submit（成人内容触发）
  if (event.isAdultContent && opts?.sensitivity !== undefined) {
    const reversed = applyDsReversal(delta, event, opts.sensitivity, opts.personalityTags)
    delta.aff = reversed.aff; delta.sec = reversed.sec
    delta.aro = reversed.aro; delta.dom = reversed.dom
  }

  const decayMul = opts?.decayMultiplier ?? 1
  const decay = EMOTION_DECAY * decayMul
  let next: Emotion4D = {
    aff: prev.aff * (1 - decay) + delta.aff,
    sec: prev.sec * (1 - decay) + delta.sec,
    aro: prev.aro * (1 - decay) + delta.aro,
    dom: prev.dom * (1 - decay) + delta.dom
  }

  const sid = opts?.sessionId ?? 'default'
  const tid = opts?.turnIndex ?? 0
  const addNoise = (v: number, salt: string) => {
    if (Math.abs(v) > NOISE_THRESHOLD_ABS) {
      const u = unitNoise01(sid, tid, salt)
      return v + (u - 0.5) * 2 * NOISE_MAX
    }
    return v
  }
  next = {
    aff: addNoise(next.aff, 'aff'),
    sec: addNoise(next.sec, 'sec'),
    aro: addNoise(next.aro, 'aro'),
    dom: addNoise(next.dom, 'dom')
  }

  next.aff = clamp100(next.aff)
  next.sec = clamp100(next.sec)
  next.aro = clamp100(next.aro)
  next.dom = clamp100(next.dom)

  const primaryLabel = mapEmotionLabel(next)
  const isLocked = checkLock(next)
  return { ...next, primaryLabel, isLocked }
}

export function applyMemoryEcho(l2: EmotionState, echo: MemoryEcho): EmotionState {
  return {
    ...l2,
    aff: clamp100(l2.aff + echo.aff),
    sec: clamp100(l2.sec + echo.sec),
    aro: clamp100(l2.aro + echo.aro),
    dom: clamp100(l2.dom + echo.dom)
  }
}
