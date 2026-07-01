// [temporalSignalExtractor] — 时间信号提取器
// 职责：检测用户消息中的时间信号（基于 Embedding 语义匹配）
// 引用：./factEmbeddingCache

import { cosineSimilarity } from './factEmbeddingCache'
import type { EmbeddingProvider } from './embedding'

/** 预定义时间相关 anchor sentences（一次性预计算 embedding） */
export type TemporalSemanticSignal = {
  label: string
  type: 'exact' | 'recurring' | 'fuzzy'
}

export const TEMPORAL_ANCHOR_SENTENCES = [
  // 时间方向
  '去年这个时候', '上周的今天', '一个月前', '三个月前', '半年前',
  '上周', '上个月', '去年', '前年',
  '明天', '后天', '下周', '下个月', '明年',
  '最近', '前几天', '前阵子', '那天', '那时候',
  // 周期性事件
  '生日', '纪念日', '过年', '中秋', '新年',
  '年底', '年初', '开学', '毕业', '入职',
  // 增量时间
  '上次', '好久不见', '很久没', '又过了一年',
  // 频次
  '每天', '每周', '每月', '每年', '经常',
]

/**
 * 从用户消息中检测时间信号。
 * 返回时间锚点描述（如果有），否则返回 null。
 * 复用已有的 msgEmbedding，不重复计算。
 *
 * @param msgEmbedding 用户消息的 embedding 向量
 * @param sentenceEmbeddings 预计算的 anchor sentences embedding
 * @param threshold cosine 相似度阈值
 */
export function detectTemporalSignal(
  msgEmbedding: number[],
  sentenceEmbeddings: Map<string, number[]>,
  threshold = 0.6
): TemporalSemanticSignal | null {
  let bestLabel = ''
  let bestScore = 0

  for (const [sentence, embed] of sentenceEmbeddings) {
    const score = cosineSimilarity(msgEmbedding, embed)
    if (score > bestScore) {
      bestScore = score
      bestLabel = sentence
    }
  }

  if (bestScore < threshold || !bestLabel) return null

  // 根据标签判断类型
  const recurringKeywords = ['生日', '纪念日', '过年', '中秋', '新年', '每天', '每周', '每月', '每年', '经常', '年底', '年初']
  const exactKeywords = ['明天', '后天', '下周', '下个月', '明年', '上周', '上个月', '去年']

  let type: 'exact' | 'recurring' | 'fuzzy' = 'fuzzy'
  const fuzzyPatterns = ['时候', '的前', '前阵子', '那天', '那时候', '好久']
  if (fuzzyPatterns.some(p => bestLabel.includes(p))) type = 'fuzzy'
  else if (recurringKeywords.some(k => bestLabel.includes(k))) type = 'recurring'
  else if (exactKeywords.some(k => bestLabel.includes(k))) type = 'exact'

  return { label: bestLabel, type }
}

/**
 * 预计算所有 anchor sentences 的 embedding。
 * 启动时调用一次，结果缓存。
 */
export async function buildTemporalEmbeddings(
  provider: EmbeddingProvider
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  if (!provider.ready()) return map
  try {
    const embeddings = await provider.embedBatch([...TEMPORAL_ANCHOR_SENTENCES])
    for (let i = 0; i < TEMPORAL_ANCHOR_SENTENCES.length; i++) {
      const vec = embeddings[i]
      if (vec?.length > 0) map.set(TEMPORAL_ANCHOR_SENTENCES[i], vec)
    }
  } catch {
    for (const sentence of TEMPORAL_ANCHOR_SENTENCES) {
      try {
        const vec = await provider.embed(sentence)
        if (vec.length > 0) map.set(sentence, vec)
      } catch { /* skip failed sentences */ }
    }
  }
  return map
}
