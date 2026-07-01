/**
 * FIX-022 — 时间锚点写入策略（ingest → temporal_anchors）
 * 与 emotionalEmergence/timeReflection、specialDate temporalHint 独立。
 */
import { randomUUID } from 'node:crypto'
import { getDatabase } from '../db/database'
import type { MemoryFact } from '../engine/types'

export type TemporalAnchorType = 'fuzzy' | 'recurring' | 'milestone' | 'relationship'

export const RECURRING_SIGNALS = [
  '生日',
  '纪念日',
  '每年',
  '周年',
  '过年',
  '中秋',
  '春节',
  '清明',
  '端午',
  '七夕',
  '元旦',
  '圣诞',
  '年底',
  '年初',
]

export function detectAnchorType(fact: MemoryFact, userMsg: string): TemporalAnchorType {
  if (fact.subcategory === 'OUR_BOND' && fact.selfRelevance >= 4.5 && fact.emotionalContext.intensity >= 0.7) {
    return 'relationship'
  }

  if (fact.selfRelevance >= 4.0 || fact.emotionalContext.intensity >= 0.8) {
    return 'milestone'
  }

  const haystack = `${fact.subject} ${fact.summary} ${userMsg}`
  if (RECURRING_SIGNALS.some((s) => haystack.includes(s))) {
    return 'recurring'
  }

  return 'fuzzy'
}

/** 是否应在 ingest 后写入 temporal_anchors（比旧版 isNew&&weight>=2&&intensity>0.5 更宽） */
export function shouldWriteTemporalAnchor(args: {
  isNew: boolean
  weight: number
  intensity: number
  fact: MemoryFact
  userMsg: string
}): boolean {
  if (!args.isNew) return false

  const anchorType = detectAnchorType(args.fact, args.userMsg)

  // 原强门槛：高 weight + 高情绪
  if (args.weight >= 2 && args.intensity > 0.5) return true

  // 周期性纪念日：允许较低 weight/情绪，避免「生日/周年」进不了锚点表
  if (anchorType === 'recurring' && args.weight >= 1 && args.intensity >= 0.35) return true

  if (anchorType === 'relationship' && args.intensity >= 0.4) return true

  if (anchorType === 'milestone' && args.weight >= 1 && args.intensity >= 0.45) return true

  // fuzzy 仍不自动写入，避免锚点表噪音
  return false
}

export function writeTemporalAnchor(
  dataRoot: string,
  fact: MemoryFact,
  anchorType: TemporalAnchorType
): void {
  try {
    const db = getDatabase(dataRoot)
    if (!db) return
    const now = new Date().toISOString()
    db.prepare(
      `INSERT OR IGNORE INTO temporal_anchors (id, anchor_date, anchor_type, linked_fact_ids, emotional_valence, emotional_intensity, domain, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      now.slice(0, 10),
      anchorType,
      JSON.stringify([fact.id]),
      fact.emotionalContext.valence,
      fact.emotionalContext.intensity,
      fact.domain,
      fact.summary.slice(0, 200),
      now
    )
  } catch {
    /* best-effort */
  }
}
