// [canon/originEscalationGuard] 鈥?OEG v1锛氬垱閫犺€呭彊浜嬫繁搴︿笌 loop 闃叉姢
// 寮曠敤锛?./engine/AckemParams, ../engine/types, ./creatorMemory

import {
  ORIGIN_COOLDOWN_TURNS,
  ORIGIN_DEEP_MAX_CHARS,
  ORIGIN_DEEP_MAX_ENTRIES,
  ORIGIN_ENTRY_MAX_CHARS,
  ORIGIN_ENTRY_MAX_ENTRIES,
  ORIGIN_EXPLORE_MAX_CHARS,
  ORIGIN_EXPLORE_MAX_ENTRIES,
  ORIGIN_STREAK_DEEP,
  ORIGIN_STREAK_EXPLORE,
  ORIGIN_STREAK_GUARD,
} from '../engine/AckemParams'
import type { OriginExposure, OriginExposureState } from '../engine/types'
import type { FatherReferenceSignal } from './creatorMemory'

export const ORIGIN_GUARD_MARKER = '銆怬rigin Guard'

export type OriginAdvanceResult = OriginExposure & {
  guardTriggered: boolean
}

export type OriginInjectionPolicy = {
  allowCanonM: boolean
  maxEntries: number
  maxChars: number
  guardPsycheBlock: string | null
}

export function defaultOriginExposure(): OriginExposure {
  return { state: 'NORMAL', streak: 0, cooldownUntilTurn: 0 }
}

export function normalizeOriginExposure(prev?: OriginExposure): OriginExposure {
  return prev ?? defaultOriginExposure()
}

function streakToState(streak: number): OriginExposureState {
  if (streak >= ORIGIN_STREAK_DEEP) return 'DEEP'
  if (streak >= ORIGIN_STREAK_EXPLORE) return 'EXPLORE'
  if (streak >= 1) return 'ENTRY'
  return 'NORMAL'
}

/** 鏄惁鍦?DEEP / GUARD 闃舵鎶戝埗闈?mandatory 鐨?origin 涓诲姩璇濋 */
export function shouldSuppressOriginProactiveTopics(exposure: OriginExposure): boolean {
  return exposure.state === 'DEEP' || exposure.state === 'GUARD_COOLDOWN'
}

export function buildOriginGuardBlock(): string {
  return [
    `${ORIGIN_GUARD_MARKER} 路 寮哄埗鍥炲綊鐢ㄦ埛銆慲,
    '宸茶繛缁杞亰 Ackem 鍑鸿韩/鍒涢€犺€呫€傛湰鍥炲悎鏈€澶氫竴鍙ュ甫杩?Jason锛岀劧鍚庤浆鍚戝綋鍓嶇敤鎴枫€?,
    '鍙俯鍜岄棶锛氥€屼綘浠婂ぉ濂藉儚涓€鐩村湪闂垜鐨勮捣鐐癸紝鏄彂鐢熶粈涔堣浣犲湪鎰忎簡鍚楋紵銆?,
    '绂佹灞曞紑鏂扮殑鍒涗綔鏁呬簨鎴栬蹇嗙墖娈点€?,
  ].join('\n')
}

/**
 * 鏍规嵁鍒涢€犺€呮寚绉颁俊鍙锋帹杩?OEG 鐘舵€併€?
 * 浠?`Ackem_creator` 璁?streak锛涘叾浣欐寚绉伴噸缃?streak銆?
 */
export function advanceOriginExposure(
  prev: OriginExposure | undefined,
  fatherRef: FatherReferenceSignal | null,
  turnIndex: number
): OriginAdvanceResult {
  let p = normalizeOriginExposure(prev)

  if (p.state === 'GUARD_COOLDOWN' && turnIndex >= p.cooldownUntilTurn) {
    p = defaultOriginExposure()
  }

  if (p.state === 'GUARD_COOLDOWN' && turnIndex < p.cooldownUntilTurn) {
    return { ...p, streak: 0, guardTriggered: false }
  }

  if (fatherRef?.kind !== 'Ackem_creator') {
    return {
      state: 'NORMAL',
      streak: 0,
      cooldownUntilTurn: 0,
      guardTriggered: false,
    }
  }

  const newStreak = p.streak + 1
  if (newStreak >= ORIGIN_STREAK_GUARD) {
    return {
      state: 'GUARD_COOLDOWN',
      streak: 0,
      cooldownUntilTurn: turnIndex + ORIGIN_COOLDOWN_TURNS,
      guardTriggered: true,
    }
  }

  return {
    state: streakToState(newStreak),
    streak: newStreak,
    cooldownUntilTurn: 0,
    guardTriggered: false,
  }
}

/** 瑙ｆ瀽鏈疆 Canon-M 娉ㄥ叆绛栫暐锛堟潯鏁?瀛楁暟/guard 鍧楋級 */
export function resolveOriginInjectionPolicy(
  exposure: OriginExposure,
  fatherRef: FatherReferenceSignal | null,
  guardTriggered: boolean
): OriginInjectionPolicy {
  if (guardTriggered) {
    return {
      allowCanonM: false,
      maxEntries: 0,
      maxChars: 0,
      guardPsycheBlock: buildOriginGuardBlock(),
    }
  }

  if (exposure.state === 'GUARD_COOLDOWN') {
    return {
      allowCanonM: false,
      maxEntries: 0,
      maxChars: 0,
      guardPsycheBlock: null,
    }
  }

  if (fatherRef?.kind !== 'Ackem_creator') {
    return {
      allowCanonM: false,
      maxEntries: 0,
      maxChars: 0,
      guardPsycheBlock: null,
    }
  }

  switch (exposure.state) {
    case 'ENTRY':
      return {
        allowCanonM: true,
        maxEntries: ORIGIN_ENTRY_MAX_ENTRIES,
        maxChars: ORIGIN_ENTRY_MAX_CHARS,
        guardPsycheBlock: null,
      }
    case 'EXPLORE':
      return {
        allowCanonM: true,
        maxEntries: ORIGIN_EXPLORE_MAX_ENTRIES,
        maxChars: ORIGIN_EXPLORE_MAX_CHARS,
        guardPsycheBlock: null,
      }
    case 'DEEP':
      return {
        allowCanonM: true,
        maxEntries: ORIGIN_DEEP_MAX_ENTRIES, // 1 鈥?杞挱鍗曟潯锛屽瓧鏁颁笂闄愪粛闅?DEEP 鏀惧
        maxChars: ORIGIN_DEEP_MAX_CHARS,
        guardPsycheBlock: null,
      }
    default:
      return {
        allowCanonM: false,
        maxEntries: 0,
        maxChars: 0,
        guardPsycheBlock: null,
      }
  }
}

/**
 * CANON-M-3锛氱敤鎴烽棶 Ackem 鍒涢€犺€?/ Jason 鏃讹紝鏈疆瀵硅瘽涓嶅緱鍐欏叆鐢ㄦ埛 Tier B锛坕ngest锛夈€?
 * 鍒涢€犺€呭彊浜嬪彧璇?Canon-M锛屼笌鐢ㄦ埛 Tier B 闅旂銆?
 */
export function shouldSkipTierBIngestForOrigin(
  trace: { l3?: { originFatherRef?: string | null } }
): boolean {
  return trace.l3?.originFatherRef === 'Ackem_creator'
}

/** 缁熻 psyche 鍧楀唴 Canon-M 鏉＄洰琛屾暟锛堟祴璇?trace 鐢級 */
export function countCanonMEntryLines(psycheBlock: string): number {
  const marker = '路 璁板繂 路 涓嶈“鍑忋€?
  const idx = psycheBlock.indexOf(marker)
  if (idx < 0) return 0
  const section = psycheBlock.slice(idx)
  return (section.match(/^- \[(identity|appearance|personality|story|longing|misc)\]/gm) ?? []).length
}
