/**
 * [embedding/scoring] — 记忆增强评分
 *
 * 职责：
 *   1. 情绪对齐评分（情绪对齐排序升级设计）
 *   2. 上下文语义重排（对话上下文注入设计）
 *   3. 主动回忆选择（主动回忆升级设计）
 *   4. 离线思绪个性化（离线思绪素材设计）
 *   5. 用户画像维度计算（用户画像推断设计）
 *   6. 日记素材重要度中心
 *
 * 设计文档：
 *   - Embedding情绪对齐排序升级_6_10.md
 *   - Embedding对话上下文注入_6_10.md
 *   - Embedding主动回忆升级_6_10.md
 *   - Embedding离线思绪素材_6_10.md
 *   - Embedding用户画像推断_6_10.md
 *   - Embedding日记素材选取_6_10.md
 */

import type { EmbeddingProvider } from '../memory/embedding'
import { cosineSimilarity } from '../memory/factEmbeddingCache'
import type { DimensionAnchors, ProfileAnchors } from './types'

// ═══════════════════════════════════════════════════════════
// 情绪对齐评分
// ═══════════════════════════════════════════════════════════

/**
 * 计算情绪对齐加权系数（Embedding 情绪对齐排序升级）。
 *
 * 在现有的数学对齐（valence 比较）之后，用 Embedding 做语义层面的情绪对齐。
 *
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param factEmbed 记忆事实的 Embedding 向量（从 factEmbeddingCache 获取）
 * @param maxBoost 最大加成比例（默认 0.3，即最多加 30%）
 * @returns 情绪对齐系数（≥1.0）
 */
export function computeEmotionAlignmentBoost(
  queryEmbed: number[],
  factEmbed: number[],
  maxBoost = 0.3
): number {
  if (queryEmbed.length === 0 || factEmbed.length === 0) return 1.0
  const alignment = cosineSimilarity(queryEmbed, factEmbed)
  return 1 + alignment * maxBoost
}

// ═══════════════════════════════════════════════════════════
// 上下文语义重排
// ═══════════════════════════════════════════════════════════

/**
 * 用语义相关度对事实列表重排（Embedding 对话上下文注入）。
 *
 * 原有排序 = 权重 × 衰减 × 时间调制 × ...
 * 语义重排 = 原有分数 × 0.6 + 语义相关度 × 0.4
 *
 * @param facts 已完成权重排序的事实列表
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param getFactEmbed 获取事实 Embedding 的函数
 * @param baseScores 原有排序的基础分（可选，不传则从 1.0 开始）
 * @returns 重排后的事实列表（原地排序 + 返回）
 */
export function rerankBySemanticRelevance<T extends { id: string }>(
  facts: T[],
  queryEmbed: number[],
  getFactEmbed: (factId: string) => number[] | undefined,
  baseScores?: number[]
): T[] {
  if (facts.length === 0 || queryEmbed.length === 0) return facts

  // 计算每条事实的语义相关度
  const semanticScores = facts.map((f, i) => {
    const factEmbed = getFactEmbed(f.id)
    if (!factEmbed || factEmbed.length === 0) return 0
    return cosineSimilarity(queryEmbed, factEmbed)
  })

  // 按加权公式重排
  facts.sort((a, b) => {
    const i = facts.indexOf(a)
    const j = facts.indexOf(b)
    const baseI = baseScores ? baseScores[i] : 1.0
    const baseJ = baseScores ? baseScores[j] : 1.0
    const sa = baseI * 0.6 + semanticScores[i] * 0.4
    const sb = baseJ * 0.6 + semanticScores[j] * 0.4
    return sb - sa
  })

  return facts
}

// ═══════════════════════════════════════════════════════════
// 对话向量计算（主动回忆 + 离线思绪共享）
// ═══════════════════════════════════════════════════════════

/** 向量平均 */
function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return []
  const dim = vectors[0].length
  const result = new Array(dim).fill(0)
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      result[i] += vec[i]
    }
  }
  for (let i = 0; i < dim; i++) {
    result[i] /= vectors.length
  }
  return result
}

/**
 * 计算对话向量（最近 N 轮用户消息的 Embedding 平均值）。
 *
 * 主动回忆和离线思绪共享此向量。
 *
 * @param recentMsgs 最近 N 轮用户消息
 * @param provider EmbeddingProvider 实例
 * @returns 对话向量，或 undefined（provider 不可用时）
 */
export async function computeConversationEmbed(
  recentMsgs: string[],
  provider?: EmbeddingProvider
): Promise<number[] | undefined> {
  if (!provider?.ready() || recentMsgs.length === 0) return undefined
  try {
    const embeds = await provider.embedBatch(recentMsgs)
    const valid = embeds.filter(e => e.length > 0)
    if (valid.length === 0) return undefined
    return averageVectors(valid)
  } catch {
    return undefined
  }
}

// ═══════════════════════════════════════════════════════════
// 主动回忆选择
// ═══════════════════════════════════════════════════════════
// 用户画像维度计算
// ═══════════════════════════════════════════════════════════

/**
 * 用最近 20 轮 Embedding 计算单个用户画像维度。
 *
 * @param recentEmbeds 最近 N 轮消息的 Embedding 数组
 * @param anchors 该维度的三档锚定词中心
 * @returns 维度值（0~1 或 -1~1），或 -1（无 Embedding 信号）
 */
export function computeDimensionFromEmbedding(
  recentEmbeds: number[][],
  anchors: DimensionAnchors
): number {
  if (recentEmbeds.length === 0) return -1

  const lowScores: number[] = []
  const midScores: number[] = []
  const highScores: number[] = []

  for (const emb of recentEmbeds) {
    if (emb.length === 0) continue
    lowScores.push(cosineSimilarity(emb, anchors.low))
    midScores.push(cosineSimilarity(emb, anchors.mid))
    highScores.push(cosineSimilarity(emb, anchors.high))
  }

  if (lowScores.length === 0) return -1

  const avgLow = lowScores.reduce((a, b) => a + b, 0) / lowScores.length
  const avgMid = midScores.reduce((a, b) => a + b, 0) / midScores.length
  const avgHigh = highScores.reduce((a, b) => a + b, 0) / highScores.length

  const total = avgLow + avgMid + avgHigh
  if (total === 0) return -1

  // 加权平均：低档 0.2，中档 0.5，高档 0.9
  return (avgLow * 0.2 + avgMid * 0.5 + avgHigh * 0.9) / total
}

// ═══════════════════════════════════════════════════════════
// 日记素材重要度中心
// ═══════════════════════════════════════════════════════════

/**
 * 计算"有意义对话"的语义中心（Embedding 日记素材选取）。
 *
 * @param provider EmbeddingProvider 实例
 * @returns 锚定中心向量
 */
export async function computeMeaningfulCenter(
  provider: EmbeddingProvider
): Promise<number[]> {
  const anchors = [
    '心里话',
    '压力大撑不住',
    '信任你',
    '决定了',
    '我发现原来我',
  ]
  const embeds = await provider.embedBatch(anchors)
  const valid = embeds.filter(e => e.length > 0)
  return averageVectors(valid)
}
