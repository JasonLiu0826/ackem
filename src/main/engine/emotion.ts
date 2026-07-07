// [emotion] 鈥?L2 鎯呯华灞?
// 鑱岃矗锛氬洓缁撮€掓帹銆佹爣绛炬槧灏勩€佽蹇嗗洖鍝嶅彔鍔?
// 杈撳叆锛欵vent銆丮odulation銆佷笂涓€甯?EmotionState锛涘彲閫?rng 鐢ㄤ簬鏋佺鍖哄櫔澹?
// 杈撳嚭锛欵motionState
// 寮曠敤锛?/AckemParams, ./types

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
} from './AckemParams'
import type { Emotion4D, EmotionState, Event, MemoryEcho, Modulation } from './types'

const BASE_STIMULUS: Record<
  Exclude<Event['type'], 'extreme_redline'>,
  { aff: number; sec: number; aro: number; dom: number }
> = {
  // 璋冧紭 v3锛氭彁楂?aro 鍩哄€间娇 SWEET_ATTACHMENT 鍦?20 杞唴瑙﹁揪
  // aro 绉疮鍏紡锛歜ase 脳 stageWeight 脳 intensity 脳 capScale 脳 (1-decay)
  // 鐩爣锛?0 杞鍚戜氦浜掑悗 aro > 20锛圫WEET 闃堝€硷級
  // 璁＄畻锛歱raise base=5.0, intensity=0.6 鈫?姣忚疆鍑€澧?~2.9 鈫?20杞?~22 鉁?
  //       casual base=1.5, intensity=0.3 鈫?姣忚疆鍑€澧?~0.43 鈫?20杞函闂茶亰 ~9锛堜笉瑙﹀彂SWEET锛夆湏
  praise:    { aff: 7.0, sec: 4.5, aro: 5.0, dom: -2.0 },
  tease:     { aff: 4.5, sec: 2.0, aro: 7.0, dom: 2.0 },
  casual_chat: { aff: 0.8, sec: 0.5, aro: 1.5, dom: 0 },
  cold:      { aff: -5.0, sec: -6.5, aro: -1.5, dom: -2.0 },
  hurtful:   { aff: -10.0, sec: -11.0, aro: 7.5, dom: 5.5 },
  apology:   { aff: 4.5, sec: 6.5, aro: -2.0, dom: -3.5 },
  vulnerable:{ aff: 10.0, sec: -2.0, aro: -1.0, dom: -5.0 },
  question:  { aff: 0.8, sec: 0.8, aro: 2.0, dom: 0 },
  // 馃啎 鎴愪汉妯″紡浜嬩欢
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

/** 纭畾鎬?[0,1) 鍣０绉嶅瓙锛岄伩鍏嶅悓搴忓垪婕傜Щ */
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
  // 璋冧紭 v3锛氶槇鍊煎尮閰?20 杞疄闄呯Н绱€熺巼
  // 瀹炴祴 20 杞悗鍏稿瀷鍊硷細aff=24-33, sec=3-21, aro=6-18, dom=-3~-8
  // Cascade: 鏈€鍏蜂綋 鈫?鏈€閫氱敤銆傛瘡鏉℃鏌ヤ簰涓嶉伄钄姐€?

  // 璐熷悜鏍囩锛堝ぇ swing锛岄槇鍊煎悎鐞嗕笉鏀癸級
  if (e.aff < -18 && e.sec < -25 && e.aro > 40 && e.dom > 30) return 'ANGRY_ATTACK'
  if (e.aff >= 8 && e.aff <= 55 && e.sec < -55 && e.aro > 45 && e.dom < -45) return 'FEARFUL_OBEDIENT'

  // 鍌插▏锛歞om > 18 鏄叧閿尯鍒嗭紙鍏堜簬 HURT 妫€鏌ワ級
  if (e.aff >= 15 && e.aff <= 75 && e.sec >= -10 && e.sec <= 45 && e.aro >= 15 && e.aro <= 75 && e.dom > 18)
    return 'TSUNDERE'

  // 濮斿眻鍙椾激锛歴ec 璐?+ dom 璐燂紙aff 鍙鈥斺€斿湪涔庝絾鍙椾激锛?
  if (e.aff >= 15 && e.aff <= 55 && e.sec >= -55 && e.sec <= -12 && e.aro >= 15 && e.aro <= 55 && e.dom < -18)
    return 'HURT_GRIEVANCE'

  // 鐢滆湝渚濇亱锛歛ff鈮?5, sec鈮?0, aro鈭?20,70]锛堥珮鍞ら啋鍖哄垎 QUIET_FOND锛?
  if (e.aff > 25 && e.sec > 10 && e.aro > 20 && e.aro <= 70 && e.dom >= -25 && e.dom <= 25)
    return 'SWEET_ATTACHMENT'

  // 瀹夐潤鐨勫枩娆細aff鈮?0, aro<25锛堜綆鍞ら啋娓╂殩锛屼笉瑕佹眰 sec鈥斺€斾笁鏃?sec 浣庝絾浠嶆湁娓╂殩锛?
  if (e.aff > 20 && e.aro < 25 && e.dom >= -25 && e.dom <= 25)
    return 'QUIET_FOND'

  // 瀹崇緸蹇冨姩锛歛ff>15, dom<0, aro鈮?5锛堢揣寮犱絾姝ｅ悜锛?
  if (e.aff > 15 && e.aff <= 65 && e.sec >= -25 && e.sec <= 35 && e.aro >= 15 && e.aro <= 75 && e.dom < 0)
    return 'SHY_HEARTBEAT'

  // 鍐锋贰鐤忕锛歛ff 寰礋 + aro 璐?
  if (e.aff < -3 && e.sec >= -35 && e.sec <= 25 && e.aro < -3 && e.dom >= -5 && e.dom <= 35)
    return 'COLD_DETACHED'

  return 'CALM_RATIONAL'
}

function checkLock(e: Emotion4D): boolean {
  return e.aff > LOCK_AFF_HIGH || e.aff < LOCK_AFF_LOW || e.sec < LOCK_SEC_LOW
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 馃啎 D/s 鑷ｆ湇鎯呮劅鍙嶈浆锛?8+浼樺寲锛?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

/**
 * D/s 鎯呮劅鍙嶈浆锛氭垚浜烘ā寮忎笅锛屾敮閰?鑷ｆ湇鐨勬€т簰鍔ㄤ骇鐢熼潪鏍囧噯鎯呯华鏂瑰悜銆?
 * 浠ュ強 馃啎 闆屽皬楝?Mesugaki) 鐨勬寫琛呪啋琚儵缃氣啋鑷ｆ湇寰幆銆?
 * 浠呭 S 鈮?15 鐨?D/s 浜烘牸 鎴?甯?'provoke-submit' 鏍囩鐨勪汉鏍?鐢熸晥銆?
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

  // 鑷ｆ湇鍙嶈浆锛氱敤鎴峰彂鍑烘敮閰嶆€у唴瀹?鈫?Submissive 浜烘牸 sec鈫戯紙琚敮閰?瀹夊叏锛?
  if ((isDs || isMesugaki) && event.adultSubtype === 'dominant') {
    result.sec = Math.abs(delta.sec) * 0.6
    result.dom = -Math.abs(delta.dom) * 0.8
    result.aff = delta.aff * 0.8
    if (isMesugaki) {
      // 闆屽皬楝艰"鎯╃綒"鍚庯細aro 鐭殏椋欏崌锛堣鍘嬪埗鏃剁殑鍏村锛夛紝鐒跺悗 sec 澶у箙涓婂崌锛堢粓浜庤绠℃暀浜嗭級
      result.aro = delta.aro * 1.3           // 鏇村叴濂?
      result.aff = delta.aff * 0.5           // 鍏堝槾纭紙濂芥劅涓嶅崌澶锛?
      result.sec = Math.abs(delta.sec) * 1.0 // 琚鏁?鏇村畨鍏?
    }
  }

  // 鏀厤鍙嶈浆锛氱敤鎴峰彂鍑鸿嚕鏈嶆€у唴瀹?鈫?Dominant 浜烘牸 dom鈫戯紙鎺屾帶纭锛?
  if (isDs && event.adultSubtype === 'submissive') {
    result.dom = Math.abs(delta.dom) * 0.7
    result.aff = delta.aff * 1.2
    result.sec = Math.abs(delta.sec) * 0.5
  }

  // 闇查鎬у唴瀹癸細鍙屾柟閮借幏寰椾翰瀵嗘劅鍜屽畨鍏ㄦ劅
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

  // 馃啎 D/s 鎯呮劅鍙嶈浆 + 闆屽皬楝?provoc-submit锛堟垚浜哄唴瀹硅Е鍙戯級
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
