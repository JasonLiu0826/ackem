/**
 * Route v2 阶段 2-5 — learned pattern loader + gate0 extension (设计 §7).
 *
 * Active `gate0_signal` patterns are loaded from the Pattern Store and tried
 * AFTER the built-in gate0 rules. 红线 (设计 §15):
 *  - 学习模式只加宽入口: 命中 → 产 work 确认卡 (cardOnly 恒为 1);
 *  - 绝不直接执行、绝不产出无候选的 plugin;
 *  - 加载失败/空 store → 静默回退到内置行为 (永不阻塞路由).
 */

import type { Motive } from '../channel/detectMotive'
import type { ChannelPlan } from '../../shared/channelPlan'
import { pendingPlan } from '../channel/plans'
import { getDatabase } from '../db/database.js'
import { listActivePatterns, recordPatternHit, type RoutePattern } from './patternStore.js'

const compiledCache = new Map<string, RegExp | null>()

function compile(patternSource: string): RegExp | null {
  if (compiledCache.has(patternSource)) return compiledCache.get(patternSource) ?? null
  let re: RegExp | null = null
  try {
    re = new RegExp(patternSource, 'i')
  } catch {
    re = null
  }
  compiledCache.set(patternSource, re)
  return re
}

export function clearLearnedPatternCache(): void {
  compiledCache.clear()
}

function loadActive(dataRoot: string): RoutePattern[] {
  try {
    const db = getDatabase(dataRoot)
    if (!db) return []
    return listActivePatterns(db).filter(
      (p) => p.layer === 'gate0_signal' && p.cardOnly === 1
    )
  } catch {
    return []
  }
}

export type LearnedGateResult = { plan: ChannelPlan; patternId: string } | null

/**
 * 门 0 学习扩展: 内置规则全部未命中 (motive=none) 时尝试。命中 → work 确认卡
 * (永不直接执行) + hit 计数。从未命中 → null (调用方继续原判定)。
 */
export function tryLearnedGate0(dataRoot: string, text: string, motive: Motive): LearnedGateResult {
  if (motive.kind !== 'none') return null
  const patterns = loadActive(dataRoot)
  if (!patterns.length) return null
  for (const p of patterns) {
    const re = compile(p.patternSource)
    if (!re || !re.test(text)) continue
    try {
      const db = getDatabase(dataRoot)
      if (db) recordPatternHit(db, p.patternId)
    } catch {
      /* counting is best-effort */
    }
    return {
      patternId: p.patternId,
      plan: pendingPlan('work_job', {
        intent: 'work',
        workKind: 'job',
        tag: 'file',
        summary: text.slice(0, 80)
      })
    }
  }
  return null
}
