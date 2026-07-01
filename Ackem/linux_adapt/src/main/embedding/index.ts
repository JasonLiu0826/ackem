/**
 * [embedding/index] — Embedding 神经连接 · 统一导出
 *
 * 本模块是 Embedding 应用层入口，封装了：
 * - 锚定向量（解释层语义兜底）
 * - 语义兜底分类
 * - 路由表匹配
 * - 评分函数（情绪对齐、上下文注入等）
 * - 记忆增强（主动回忆、离线思绪、日记素材）
 *
 * 依赖 memory/embedding 基础设施层（provider、onnxProvider、modelManager）。
 */

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export type {
  // 解释层
  GeneralCategory,
  AdultCategory,
  FallbackCategory,
  AnchorVectors,
  FallbackResult,
  // 路由表
  RouteIndexEntry,
  RouteIndex,
  RouteMatchResult,
  // OpenForU
  IntentAnchors,
  OpenForUIntent,
  // 知识/计划
  KnowledgeIntentAnchors,
  PlanIntentAnchors,
  // 用户画像
  DimensionAnchors,
  ProfileAnchors,
  // 日记
  DiaryAnchors,
} from './types'

export {
  HIGH_CONFIDENCE_THRESHOLD,
  MID_CONFIDENCE_THRESHOLD,
} from './types'

// ═══════════════════════════════════════════════════════════
// 锚定向量
// ═══════════════════════════════════════════════════════════

export {
  buildAnchorVectors,
  classifyBySemantics,
  classifyAdultContent,
  type GeneralAnchorWords,
  type AdultAnchorWords,
  GENERAL_ANCHOR_WORDS,
  ADULT_ANCHOR_WORDS,
} from './anchorVectors'

// ═══════════════════════════════════════════════════════════
// 语义兜底
// ═══════════════════════════════════════════════════════════

export {
  applyEmbeddingFallback,
  detectNegation,
} from './semanticFallback'

// ═══════════════════════════════════════════════════════════
// 路由表
// ═══════════════════════════════════════════════════════════

export {
  buildRouteIndex,
  addToRouteIndex,
  matchAgainstRouteTable,
  BUILTIN_ROUTE_TABLE,
} from './routeTable'

// ═══════════════════════════════════════════════════════════
// 评分函数
// ═══════════════════════════════════════════════════════════

export {
  computeEmotionAlignmentBoost,
  rerankBySemanticRelevance,
  computeConversationEmbed,
  computeDimensionFromEmbedding,
  computeMeaningfulCenter,
} from './scoring'
