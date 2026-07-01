// [canon/originEscalationGuard] — OEG v1：创造者叙事深度与 loop 防护
// 引用：../engine/ackemParams, ../engine/types, ./creatorMemory

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
} from '../engine/ackemParams'
import type { OriginExposure, OriginExposureState } from '../engine/types'
import type { FatherReferenceSignal } from './creatorMemory'

export const ORIGIN_GUARD_MARKER = '【Origin Guard'

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

/** 是否在 DEEP / GUARD 阶段抑制非 mandatory 的 origin 主动话题 */
export function shouldSuppressOriginProactiveTopics(exposure: OriginExposure): boolean {
  return exposure.state === 'DEEP' || exposure.state === 'GUARD_COOLDOWN'
}

export function buildOriginGuardBlock(): string {
  return [
    `${ORIGIN_GUARD_MARKER} · 强制回归用户】`,
    '已连续多轮聊 Ackem 出身/创造者。本回合最多一句带过 Jason，然后转向当前用户。',
    '可温和问：「你今天好像一直在问我的起点，是发生什么让你在意了吗？」',
    '禁止展开新的创作故事或记忆片段。',
  ].join('\n')
}

/**
 * 根据创造者指称信号推进 OEG 状态。
 * 仅 `ackem_creator` 计 streak；其余指称重置 streak。
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

  if (fatherRef?.kind !== 'ackem_creator') {
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

/** 解析本轮 Canon-M 注入策略（条数/字数/guard 块） */
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

  if (fatherRef?.kind !== 'ackem_creator') {
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
        maxEntries: ORIGIN_DEEP_MAX_ENTRIES, // 1 — 轮播单条，字数上限仍随 DEEP 放宽
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
 * CANON-M-3：用户问 Ackem 创造者 / Jason 时，本轮对话不得写入用户 Tier B（ingest）。
 * 创造者叙事只读 Canon-M，与用户 Tier B 隔离。
 */
export function shouldSkipTierBIngestForOrigin(
  trace: { l3?: { originFatherRef?: string | null } }
): boolean {
  return trace.l3?.originFatherRef === 'ackem_creator'
}

/** 统计 psyche 块内 Canon-M 条目行数（测试/trace 用） */
export function countCanonMEntryLines(psycheBlock: string): number {
  const marker = '· 记忆 · 不衰减】'
  const idx = psycheBlock.indexOf(marker)
  if (idx < 0) return 0
  const section = psycheBlock.slice(idx)
  return (section.match(/^- \[(identity|appearance|personality|story|longing|misc)\]/gm) ?? []).length
}
