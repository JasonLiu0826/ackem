// [taxonomy] — L4 记忆分类
// 职责：6 领域 × 25 子类常量与元数据
// 输入：无
// 输出：类型安全子类枚举与 CATEGORY_META
// 引用：无

export const DOMAINS = [
  'IDENTITY',
  'SOCIAL',
  'DAILY_LIFE',
  'PURSUITS',
  'INNER_WORLD',
  'TEMPORAL'
] as const

export type Domain = (typeof DOMAINS)[number]

export const SUBCATEGORIES = {
  IDENTITY: ['BASIC_PROFILE', 'LIFE_STORY', 'VALUES_BELIEFS', 'SELF_PERCEPTION'] as const,
  SOCIAL: ['OUR_BOND', 'FAMILY', 'FRIENDS', 'PARTNER'] as const,
  DAILY_LIFE: ['ROUTINES', 'HEALTH', 'LIVING_SPACE', 'LIFESTYLE'] as const,
  PURSUITS: ['CAREER', 'LEARNING', 'GOALS', 'PROJECTS', 'PROCEDURES'] as const,
  INNER_WORLD: ['MOOD', 'TASTES', 'VULNERABILITIES', 'INSIDE_JOKES'] as const,
  TEMPORAL: ['NOW', 'COMMITMENTS', 'PLANS', 'WORLD'] as const
} as const

export type Subcategory =
  | (typeof SUBCATEGORIES.IDENTITY)[number]
  | (typeof SUBCATEGORIES.SOCIAL)[number]
  | (typeof SUBCATEGORIES.DAILY_LIFE)[number]
  | (typeof SUBCATEGORIES.PURSUITS)[number]
  | (typeof SUBCATEGORIES.INNER_WORLD)[number]
  | (typeof SUBCATEGORIES.TEMPORAL)[number]

export type CategoryMeta = {
  defaultWeight: number
  defaultConfidence: number
  decayLambda: number
  selfRelevance: number
  autoRetireDays?: number
  passiveOnly?: boolean
}

/** 与系统总览 §5.4 λ 表对齐 */
export const CATEGORY_META: Record<Subcategory, CategoryMeta> = {
  BASIC_PROFILE: { defaultWeight: 3, defaultConfidence: 0.9, decayLambda: 0.001, selfRelevance: 1 },
  LIFE_STORY: { defaultWeight: 3, defaultConfidence: 0.9, decayLambda: 0.001, selfRelevance: 1 },
  VALUES_BELIEFS: { defaultWeight: 2, defaultConfidence: 0.8, decayLambda: 0.003, selfRelevance: 0.95 },
  SELF_PERCEPTION: { defaultWeight: 2, defaultConfidence: 0.75, decayLambda: 0.005, selfRelevance: 1 },
  OUR_BOND: { defaultWeight: 3, defaultConfidence: 0.9, decayLambda: 0.001, selfRelevance: 1 },
  FAMILY: { defaultWeight: 2, defaultConfidence: 0.85, decayLambda: 0.002, selfRelevance: 0.9 },
  FRIENDS: { defaultWeight: 1.5, defaultConfidence: 0.75, decayLambda: 0.005, selfRelevance: 0.85 },
  PARTNER: { defaultWeight: 2, defaultConfidence: 0.8, decayLambda: 0.003, selfRelevance: 0.95 },
  ROUTINES: { defaultWeight: 1, defaultConfidence: 0.7, decayLambda: 0.008, selfRelevance: 0.7 },
  HEALTH: { defaultWeight: 2, defaultConfidence: 0.85, decayLambda: 0.002, selfRelevance: 0.95 },
  LIVING_SPACE: { defaultWeight: 1, defaultConfidence: 0.75, decayLambda: 0.01, selfRelevance: 0.75 },
  LIFESTYLE: { defaultWeight: 1, defaultConfidence: 0.7, decayLambda: 0.01, selfRelevance: 0.75 },
  CAREER: { defaultWeight: 1.5, defaultConfidence: 0.8, decayLambda: 0.005, selfRelevance: 0.85 },
  LEARNING: { defaultWeight: 1.2, defaultConfidence: 0.75, decayLambda: 0.008, selfRelevance: 0.8 },
  GOALS: { defaultWeight: 1.5, defaultConfidence: 0.75, decayLambda: 0.005, selfRelevance: 0.85 },
  PROJECTS: { defaultWeight: 1.2, defaultConfidence: 0.75, decayLambda: 0.008, selfRelevance: 0.8 },
  PROCEDURES: { defaultWeight: 2, defaultConfidence: 0.85, decayLambda: 0.002, selfRelevance: 0.9 },
  MOOD: { defaultWeight: 1, defaultConfidence: 0.65, decayLambda: 0.05, selfRelevance: 0.7 },
  TASTES: { defaultWeight: 1.2, defaultConfidence: 0.8, decayLambda: 0.005, selfRelevance: 0.85 },
  VULNERABILITIES: { defaultWeight: 2, defaultConfidence: 0.7, decayLambda: 0.003, selfRelevance: 1 },
  INSIDE_JOKES: { defaultWeight: 1.2, defaultConfidence: 0.8, decayLambda: 0.005, selfRelevance: 0.9 },
  NOW: {
    defaultWeight: 0.8,
    defaultConfidence: 0.65,
    decayLambda: 0.1,
    selfRelevance: 0.6,
    autoRetireDays: 3
  },
  COMMITMENTS: { defaultWeight: 2, defaultConfidence: 0.9, decayLambda: 0, selfRelevance: 0.95 },
  PLANS: {
    defaultWeight: 1,
    defaultConfidence: 0.75,
    decayLambda: 0.02,
    selfRelevance: 0.75,
    autoRetireDays: 7
  },
  WORLD: {
    defaultWeight: 0.8,
    defaultConfidence: 0.65,
    decayLambda: 0.1,
    selfRelevance: 0.55,
    autoRetireDays: 7
  }
}

export function isValidSubcategory(s: string): s is Subcategory {
  return s in CATEGORY_META
}
