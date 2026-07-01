/**
 * [embedding/routeTable] — Embedding 路由表
 *
 * 职责：
 *   1. 定义官方扩展的 exampleQueries
 *   2. 构建 Embedding 路由索引（启动时批量计算）
 *   3. 查询匹配（用户消息 vs 路由表）
 *
 * 设计文档：docs/system/Embedding意图路由设计_6_8_已实现.md
 */

import type { EmbeddingProvider } from '../memory/embedding'
import { cosineSimilarity } from '../memory/factEmbeddingCache'
import {
  HIGH_CONFIDENCE_THRESHOLD,
  MID_CONFIDENCE_THRESHOLD,
  type RouteIndex,
  type RouteIndexEntry,
  type RouteMatchResult,
} from './types'

// ═══════════════════════════════════════════════════════════
// 官方扩展路由表（硬编码）
// ═══════════════════════════════════════════════════════════

/**
 * 官方扩展的 exampleQueries。
 * 每个扩展 5-10 条用户实际会说的话。
 * 启动时自动计算 Embedding 并加入路由索引。
 */
export const BUILTIN_ROUTE_TABLE: Record<string, string[]> = {
  // 天气
  'ackem/weather-sense@0.0.1': [
    '帮我查天气', '明天会下雨吗', '需要带伞吗',
    '杭州天气怎么样', '今天冷不冷', '气温多少度',
    '今天会不会下雨', '出门需要带伞吗',
  ],

  // 搜索
  'ackem/web-search@1.0.0': [
    '帮我搜一下天气', '查一下明天天气',
    '帮我查一下这个什么意思', '搜索一下这个词',
    '帮我找找相关资料', '这个东西是什么',
    '帮我上网查查', '搜一下最近有什么新闻',
  ],

  // 提醒
  'ackem/sedentary-reminder@0.0.1': [
    '坐得腰疼', '坐太久了', '该站起来了吧',
    '起来活动一下', '脖子好酸', '腰不舒服',
    '坐久了不舒服', '该活动活动了',
  ],
  'ackem/drink-water-reminder@0.0.1': [
    '我想喝水', '该喝水了', '好渴',
    '补充水分', '倒杯水', '提醒我喝水',
    '口渴了',
  ],
  'ackem/late-night-reminder@0.0.1': [
    '熬夜好伤身', '该睡觉了', '怎么这么晚了',
    '已经是凌晨了', '该休息了',
  ],

  // 陪伴
  'ackem/emergency-companion@1.0.0': [
    '我心情不好', '好难受', '想哭',
    '我好难过', '心里不舒服', '感觉撑不下去了',
    '想找人说说话', '今天特别难过',
  ],

  // 表格
  'ackem/markdown-table@1.0.0': [
    '帮我做个表格', '整理成表格形式', '做个对比表',
    '帮我列个清单', '做个对比', '列个表',
  ],

  // 日程提醒
  'ackem/light-schedule@0.0.1': [
    '提醒我下午3点开会', '明天9点叫我', '设个闹钟',
    '帮我记一下日程', '下午有个会别让我忘了',
    '帮我设置提醒', '记一下这个时间',
  ],

  // 日记
  'ackem/diary-auto@0.1.0': [
    '写日记', '今天发生了什么', '帮我记录今天',
    '今天的日记', '帮我写日记',
  ],

  // 计划书
  'ackem/plan-document@1.0.0': [
    '做个计划', '帮我规划一下', '排个日程',
    '帮我安排一下行程', '做一份计划书',
    '帮我规划旅行', '接下来该做什么',
  ],

  // 知识呈现
  'ackem/knowledge-presentation@1.0.0': [
    '这是什么', '解释一下', '帮我科普一下',
    '介绍一下', '我想了解', '量子计算是什么',
  ],

  // 趣味档案
  'ackem/fun-profile@0.0.1': [
    '我今天是什么状态', '给我做个分析', '我最近怎么样',
    '看看我的情绪', '分析一下我',
  ],

  // 桌面陪伴
  'ackem/desktop-companion@0.0.1': [
    '打开桌面陪伴', '显示桌面', '隐藏陪伴',
    '开启桌面模式',
  ],
}

// ═══════════════════════════════════════════════════════════
// 路由表构建
// ═══════════════════════════════════════════════════════════

/**
 * 启动时调用：构建 Embedding 路由索引。
 *
 * @param provider EmbeddingProvider 实例
 * @param extraEntries 额外的路由条目（uplugin/uskills/自动学习）
 * @returns 路由索引
 */
export async function buildRouteIndex(
  provider: EmbeddingProvider,
  extraEntries: Array<{ extensionId: string; query: string }> = []
): Promise<RouteIndex> {
  // 收集所有路由条目
  const allQueries: Array<{ extId: string; query: string }> = []

  for (const [extId, queries] of Object.entries(BUILTIN_ROUTE_TABLE)) {
    for (const q of queries) {
      allQueries.push({ extId, query: q })
    }
  }
  for (const e of extraEntries) {
    allQueries.push({ extId: e.extensionId, query: e.query })
  }

  // 去重（同一 query 可能对应多个扩展）
  const seen = new Set<string>()
  const unique = allQueries.filter((q) => {
    const key = `${q.extId}||${q.query}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 批量计算 Embedding
  const embeddings = await provider.embedBatch(unique.map((q) => q.query))

  // 组装索引
  const entries: RouteIndexEntry[] = unique.map((q, i) => ({
    extensionId: q.extId,
    query: q.query,
    embedding: embeddings[i] ?? [],
  }))

  return { entries }
}

/**
 * 新扩展注册时：增量更新路由索引（只算新 queries 的 Embedding）。
 */
export async function addToRouteIndex(
  index: RouteIndex,
  extensionId: string,
  newQueries: string[],
  provider: EmbeddingProvider
): Promise<void> {
  const embeddings = await provider.embedBatch(newQueries)
  for (let i = 0; i < newQueries.length; i++) {
    if (embeddings[i]?.length > 0) {
      index.entries.push({
        extensionId,
        query: newQueries[i],
        embedding: embeddings[i],
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 路由匹配
// ═══════════════════════════════════════════════════════════

/**
 * 每条消息调用：Embedding 匹配路由表。
 *
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param index 路由索引
 * @param topK 返回 top-K 匹配结果
 * @returns 排序后的匹配结果列表
 */
export function matchAgainstRouteTable(
  queryEmbed: number[],
  index: RouteIndex,
  topK: number = 5
): RouteMatchResult[] {
  return index.entries
    .map((entry) => ({
      extensionId: entry.extensionId,
      query: entry.query,
      score: cosineSimilarity(queryEmbed, entry.embedding),
    }))
    .filter((r) => r.score >= MID_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// ═══════════════════════════════════════════════════════════
// 规则检查（第二层）
// ═══════════════════════════════════════════════════════════

export type RuleResult = {
  action: 'allow' | 'block' | 'uncertain'
  reason: string
}

/**
 * 第二层：中置信时的规则检查。
 *
 * @param message 用户消息
 * @returns 规则判断结果
 */
export function applyQuickRules(message: string): RuleResult {
  // 规则 1：否定词 → 不触发
  if (/不要|别|不想|停止|取消|关闭|算了/.test(message)) {
    return { action: 'block', reason: 'negation_detected' }
  }

  // 规则 2：疑问句（不是请求）→ 不触发
  if (/好不好|是什么|怎么样|可以吗/.test(message)
      && !/打开|启动|帮我|我要|请/.test(message)) {
    return { action: 'block', reason: 'question_not_request' }
  }

  // 规则 3：时间相关 + 非 dispatched 扩展 → 不触发
  if (/提醒我|几点|到时候/.test(message)) {
    return { action: 'block', reason: 'schedule_no_dispatched' }
  }

  return { action: 'uncertain', reason: 'rule_uncertain' }
}
