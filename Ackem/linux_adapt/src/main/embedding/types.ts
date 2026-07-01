/**
 * [embedding/types] — Embedding 神经连接 · 应用层类型
 *
 * 本模块是 Embedding 应用层（区别于 memory/embedding 基础设施层），
 * 定义锚定向量、路由表、语义兜底所需的全部类型。
 */

// ═══════════════════════════════════════════════════════════
// 锚定向量的类别（解释层语义兜底）
// ═══════════════════════════════════════════════════════════

/** 通用模式类别（始终激活） */
export type GeneralCategory =
  | 'vulnerable'
  | 'praise'
  | 'hurtful'
  | 'apology'
  | 'cold'
  | 'tease'
  | 'question'

/** 成人模式类别（仅成人模式开启时激活） */
export type AdultCategory =
  | 'adult_suggestive'
  | 'adult_dominant'
  | 'adult_submissive'

/** 所有语义兜底类别 */
export type FallbackCategory = GeneralCategory | AdultCategory

// ═══════════════════════════════════════════════════════════
// 锚定向量的数据结构
// ═══════════════════════════════════════════════════════════

/** 每个类别的语义中心向量（该类别所有锚定词 Embedding 的平均值） */
export interface AnchorVectors {
  // 通用（始终激活）
  vulnerable: number[]
  praise: number[]
  hurtful: number[]
  apology: number[]
  cold: number[]
  tease: number[]
  question: number[]
  // 成人模式（仅成人模式开启时参与匹配）
  adult_suggestive?: number[]
  adult_dominant?: number[]
  adult_submissive?: number[]
}

/** 语义兜底分类结果 */
export interface FallbackResult {
  category: FallbackCategory
  score: number
  /** 是否被否定词反转 */
  negated: boolean
  /** 置信度等级 */
  confidence: 'high' | 'medium' | 'low'
}

// ═══════════════════════════════════════════════════════════
// 路由表
// ═══════════════════════════════════════════════════════════

/** 路由表条目 */
export interface RouteIndexEntry {
  extensionId: string
  query: string
  embedding: number[]
}

/** Embedding 路由表索引 */
export interface RouteIndex {
  entries: RouteIndexEntry[]
}

/** 路由匹配结果 */
export interface RouteMatchResult {
  extensionId: string
  query: string
  score: number
}

// ═══════════════════════════════════════════════════════════
// OpenForU 意图分类
// ═══════════════════════════════════════════════════════════

/** OpenForU 意图分类锚定 */
export interface IntentAnchors {
  create_new: number[]
  invoke_existing: number[]
  ephemeral: number[]
}

/** OpenForU 意图分类结果 */
export type OpenForUIntent = 'create_new' | 'invoke_existing' | 'ephemeral' | 'none'

// ═══════════════════════════════════════════════════════════
// 知识/计划意图
// ═══════════════════════════════════════════════════════════

/** 知识意图锚定 */
export interface KnowledgeIntentAnchors {
  knowledge_intent: number[]
}

/** 计划意图锚定 */
export interface PlanIntentAnchors {
  plan_intent: number[]
}

// ═══════════════════════════════════════════════════════════
// 用户画像维度
// ═══════════════════════════════════════════════════════════

/** 用户画像维度锚定（三档） */
export interface DimensionAnchors {
  /** 低档锚定词中心 */
  low: number[]
  /** 中档锚定词中心 */
  mid: number[]
  /** 高档锚定词中心 */
  high: number[]
}

/** 用户画像全维度锚定 */
export interface ProfileAnchors {
  sexualDirectness: DimensionAnchors
  dominancePreference: DimensionAnchors
  emotionalNeediness: DimensionAnchors
}

// ═══════════════════════════════════════════════════════════
// 日记素材
// ═══════════════════════════════════════════════════════════

/** 日记素材重要度中心 */
export interface DiaryAnchors {
  /** "有意义对话"中心向量 */
  meaningfulCenter: number[]
}

// ═══════════════════════════════════════════════════════════
// 路由决策
// ═══════════════════════════════════════════════════════════

/** 高置信/中置信/低置信阈值常量 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.70
export const MID_CONFIDENCE_THRESHOLD = 0.45
