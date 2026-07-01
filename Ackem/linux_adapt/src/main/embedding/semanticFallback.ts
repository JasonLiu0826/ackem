/**
 * [embedding/semanticFallback] — 解释层语义兜底
 *
 * 职责：
 *   1. 将 Embedding 兜底结果映射回 interpreter 的事件类型
 *   2. 处理否定检测后的类别反转
 *   3. 应用三级置信度降级 → intensity 调整
 *
 * 设计文档：docs/system/解释层语义兜底设计_6_9_已实现.md
 */

import type { AnchorVectors, FallbackResult } from './types'
import { detectNegation, classifyBySemantics, classifyAdultContent } from './anchorVectors'

// ═══════════════════════════════════════════════════════════
// FallbackCategory → EventType 映射
// ═══════════════════════════════════════════════════════════

/** 通用的 FallbackCategory → 解释层 EventType 映射 */
const GENERAL_TYPE_MAP: Record<string, string> = {
  vulnerable: 'vulnerable',
  praise: 'praise',
  hurtful: 'hurtful',
  apology: 'apology',
  cold: 'cold',
  tease: 'tease',
  question: 'question',
}

/** 成人的 FallbackCategory → 解释层 EventType 映射 */
const ADULT_TYPE_MAP: Record<string, string> = {
  adult_suggestive: 'adult_flirt',
  adult_dominant: 'adult_dominant',
  adult_submissive: 'adult_submissive',
}

/**
 * 将 FallbackCategory 映射回解释层的 EventType。
 */
export function mapFallbackToEventType(category: string): string {
  return GENERAL_TYPE_MAP[category] ?? ADULT_TYPE_MAP[category] ?? 'casual_chat'
}

// ═══════════════════════════════════════════════════════════
// 否定检测（从 anchorVectors 重新导出）
// ═══════════════════════════════════════════════════════════

export { detectNegation }

// ═══════════════════════════════════════════════════════════
// 语义兜底应用
// ═══════════════════════════════════════════════════════════

export interface EmbeddingFallbackOutput {
  /** 映射后的解释层事件类型 */
  type: string
  /** Embedding 相似度分数 */
  score: number
  /** 是否经过否定反转 */
  negated: boolean
  /** 置信度等级 */
  confidence: 'high' | 'medium' | 'low'
}

/**
 * 应用 Embedding 语义兜底，输出可被解释层使用的结果。
 *
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param msg 用户消息原文（用于否定检测）
 * @param anchors 预计算的锚定向量
 * @param adultMode 是否开启成人模式
 * @returns 兜底结果，或 null（未命中）
 */
export function applyEmbeddingFallback(
  queryEmbed: number[],
  msg: string,
  anchors: AnchorVectors,
  adultMode: boolean = false
): EmbeddingFallbackOutput | null {
  // 成人模式：先检查成人兜底
  if (adultMode && anchors.adult_suggestive) {
    const adultResult = classifyAdultContent(queryEmbed, anchors)
    if (adultResult && adultResult.confidence !== 'low') {
      const type = ADULT_TYPE_MAP[adultResult.category] ?? 'casual_chat'
      return { type, score: adultResult.score, negated: false, confidence: adultResult.confidence }
    }
  }

  // 通用兜底
  const result = classifyBySemantics(queryEmbed, anchors, 'general')
  if (!result || result.confidence === 'low') return null

  // 否定检测
  const { category, negated } = detectNegation(msg, result.category)
  const type = mapFallbackToEventType(category)

  // 中置信时 intensity 须打 8 折（调用方处理）
  return {
    type,
    score: result.score,
    negated,
    confidence: result.confidence,
  }
}
