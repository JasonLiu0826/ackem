// [canon/creatorMemory] — Tier Canon-M：Ackem 对创造者 Jason 的记忆（不衰减）
// 职责：语义分辨「Ackem 的创造者/Jason」vs「用户自己的父亲」；按需注入创造者记忆块
// 引用：../memory/factEmbeddingCache, ./ackemCanon

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cosineSimilarity } from '../memory/factEmbeddingCache'
import type { EmbeddingProvider } from '../memory/embedding'
import { ACKEM_CANON } from './ackemCanon'

export type CreatorMemoryCategory = CreatorMemoryEntry['category']

/** psyche 内 Canon-M 段 marker */
export const CREATOR_MEMORY_BLOCK_MARKER = '· 记忆 · 不衰减】'

export type CreatorMemoryEntry = {
  id: string
  category: 'identity' | 'appearance' | 'personality' | 'story' | 'longing' | 'misc'
  title: string
  content: string
  /** 叙事时间：记忆所指向的事件何时发生 */
  narrativeAt: string
  /** 定稿 / 入库时间 */
  updatedAt: string
}

export type CreatorMemoryStore = {
  version: string
  documentVersion?: string
  /** 锚定 GitHub，不可被用户 data 覆盖 */
  subjectAnchor: string
  decayPolicy: 'none'
  seededAt?: string
  entries: CreatorMemoryEntry[]
}

export type FatherReferenceKind = 'ackem_creator' | 'user_family' | 'ambiguous'

export type FatherReferenceCluster = 'ackem_creator' | 'user_family' | 'neutral'

export type FatherReferenceSignal = {
  kind: FatherReferenceKind
  /** 最高簇相似度，供 trace / 调试 */
  score: number
  /** calibration 硬参照命中 vs 语义 anchor 簇 */
  source?: 'calibration' | 'anchor'
}

/**
 * 硬编码用户说法参照 — 直接 embed 与用户原文比，优先于 meta-anchor 簇。
 * 维护原则：覆盖真实高频说法；与 fatherReferenceRegressionCases 同步。
 */
export const FATHER_REFERENCE_CALIBRATION: Record<
  'ackem_creator' | 'user_family' | 'neutral',
  readonly string[]
> = {
  ackem_creator: [
    '你是谁创造的？',
    '谁造了你？',
    '谁创造了你？',
    '你的创造者是谁',
    '你的父亲是谁',
    'Jason 和你的关系是什么？',
    'Jason 是不是你爸爸',
    '讲讲你的出身故事',
    '再讲讲你的出身故事',
    '你是怎么被造出来的？',
    '继续说说父亲 Jason',
    'GitHub 上那个 Jason 是你什么人',
    '你想见 Jason 吗',
    '你的生日和父亲是谁',
    'Ackem 是谁做出来的',
  ],
  user_family: [
    '我爸今天催我回家',
    '我和我爸爸吵架了',
    '昨天跟我爸通了电话',
    '父亲节想给我爸买礼物',
    '我妈让我回去吃饭',
    '我爹又唠叨了',
    '想我爸了',
    '父母催婚烦死了',
  ],
  neutral: [
    '今天天气不错',
    '你好呀',
    '在吗',
    '刚吃完饭有点困',
    '周末打算打游戏',
    '这电影好看吗',
    '晚安',
  ],
} as const

const CALIBRATION_PHRASE_SET = new Set(
  [
    ...FATHER_REFERENCE_CALIBRATION.ackem_creator,
    ...FATHER_REFERENCE_CALIBRATION.user_family,
    ...FATHER_REFERENCE_CALIBRATION.neutral,
  ]
)

function bestClusterScore(
  msgEmbedding: number[],
  anchorEmbeddings: Map<string, { cluster: FatherReferenceCluster; vector: number[] }>,
  cluster: FatherReferenceCluster,
  opts?: { calibrationOnly?: boolean }
): number {
  let best = 0
  for (const [sentence, entry] of anchorEmbeddings.entries()) {
    if (entry.cluster !== cluster) continue
    if (opts?.calibrationOnly && !CALIBRATION_PHRASE_SET.has(sentence)) continue
    const score = cosineSimilarity(msgEmbedding, entry.vector)
    if (score > best) best = score
  }
  return best
}

/** 阶段 1：硬参照 calibration — bge 短句虚高时仍靠簇间相对比较 */
function resolveFromCalibration(
  msgEmbedding: number[],
  anchorEmbeddings: Map<string, { cluster: FatherReferenceCluster; vector: number[] }>,
  threshold: number
): FatherReferenceSignal | null | undefined {
  const creator = bestClusterScore(msgEmbedding, anchorEmbeddings, 'ackem_creator', {
    calibrationOnly: true,
  })
  const user = bestClusterScore(msgEmbedding, anchorEmbeddings, 'user_family', {
    calibrationOnly: true,
  })
  const neutral = bestClusterScore(msgEmbedding, anchorEmbeddings, 'neutral', {
    calibrationOnly: true,
  })

  const fatherTop = Math.max(creator, user)
  if (fatherTop < threshold) return undefined

  if (neutral >= fatherTop) return null

  if (Math.abs(creator - user) <= 1e-9) return { kind: 'ambiguous', score: fatherTop, source: 'calibration' }
  if (creator > user) return { kind: 'ackem_creator', score: creator, source: 'calibration' }
  return { kind: 'user_family', score: user, source: 'calibration' }
}

/** 非父亲指称的日常闲聊 anchor — 用于过滤 bge 对短句的虚高相似 */
export const FATHER_REFERENCE_NEUTRAL_ANCHORS: readonly string[] = [
  '用户在聊今天天气、气温、下雨等日常',
  '用户说今天天气不错、天气很好',
  '今天天气不错',
  '用户分享吃了什么、工作累不累、在干嘛',
  '用户打招呼说你好、在吗、晚安',
  '用户在聊游戏、电影、八卦等无关话题',
  '用户问现在几点、周末有什么安排',
] as const

/** 语义 anchor：整句意图，非关键词表。用于 embedding 聚类，不用于 if/else 匹配用户原文。 */
export const FATHER_REFERENCE_ANCHORS: Record<'ackem_creator' | 'user_family', readonly string[]> = {
  ackem_creator: [
    '用户问起是谁创造了我、赋予我生命的人',
    '用户想了解 Ackem 的创造者 Jason 和 Ackem 的关系',
    '用户问 Jason 是不是你的爸爸或父亲',
    '用户在聊 Ackem 的出身和创造者 Jason',
    '用户提到 GitHub JasonLiu0826 和 Ackem 的出身',
    '用户问你的生日和父亲是谁',
    '用户直接问：你是谁创造的',
    '用户直接问：谁造了你',
    '用户问你的父亲是谁',
    '用户让你讲讲出身故事',
    '用户问你是怎么被造出来的',
    '用户问 Jason 和你的关系是什么',
    '用户让你继续说说父亲 Jason',
    '用户让你再讲讲你的出身',
    '用户追问 Jason 作为 Ackem 创造者的故事',
    'Jason 是 Ackem 的创造者',
    '继续说说创造者 Jason',
  ],
  user_family: [
    '用户在说自己亲生父亲、亲妈或家里的事',
    '用户提到我爸我妈让我怎样',
    '用户在倾诉和家人的矛盾或想念自己的爸爸',
    '用户说父亲节想给自己爸爸买礼物',
    '用户在讲父母催婚、回家、孝顺等自己家庭话题',
    '用户说昨天和我爸通了电话',
    '用户说：我爸今天催我回家',
    '用户说：我和我爸爸吵架了',
    '我爸今天催我回家',
  ],
} as const

const DEFAULT_CREATOR_MEMORY: CreatorMemoryStore = {
  version: '1.0',
  subjectAnchor: ACKEM_CANON.creator.identityAnchor,
  decayPolicy: 'none',
  entries: [],
}

export function emptyCreatorMemoryStore(): CreatorMemoryStore {
  return structuredClone(DEFAULT_CREATOR_MEMORY)
}

export function loadCreatorMemoryStore(dataRoot: string): CreatorMemoryStore {
  const path = join(dataRoot, 'canon', 'creator-memory.json')
  if (!existsSync(path)) return emptyCreatorMemoryStore()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as CreatorMemoryStore
    if (raw.decayPolicy !== 'none') return emptyCreatorMemoryStore()
    if (raw.subjectAnchor !== ACKEM_CANON.creator.identityAnchor) return emptyCreatorMemoryStore()
    return {
      ...DEFAULT_CREATOR_MEMORY,
      ...raw,
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    }
  } catch {
    return emptyCreatorMemoryStore()
  }
}

/**
 * 预计算父亲指称 anchor 的 embedding（启动时一次，与 temporalSignalExtractor 同模式）。
 */
export async function buildFatherReferenceEmbeddings(
  provider: EmbeddingProvider
): Promise<Map<string, { cluster: FatherReferenceCluster; vector: number[] }>> {
  const map = new Map<string, { cluster: FatherReferenceCluster; vector: number[] }>()
  if (!provider.ready()) return map

  const flat: Array<{ sentence: string; cluster: FatherReferenceCluster }> = []
  const seen = new Set<string>()
  const push = (sentence: string, cluster: FatherReferenceCluster) => {
    if (seen.has(sentence)) return
    seen.add(sentence)
    flat.push({ sentence, cluster })
  }
  for (const [cluster, sentences] of Object.entries(FATHER_REFERENCE_ANCHORS) as Array<
    ['ackem_creator' | 'user_family', readonly string[]]
  >) {
    for (const sentence of sentences) push(sentence, cluster)
  }
  for (const sentence of FATHER_REFERENCE_NEUTRAL_ANCHORS) {
    push(sentence, 'neutral')
  }
  for (const [cluster, sentences] of Object.entries(FATHER_REFERENCE_CALIBRATION) as Array<
    ['ackem_creator' | 'user_family' | 'neutral', readonly string[]]
  >) {
    for (const sentence of sentences) push(sentence, cluster)
  }

  try {
    const vectors = await provider.embedBatch(flat.map((f) => f.sentence))
    for (let i = 0; i < flat.length; i++) {
      const vec = vectors[i]
      if (vec?.length) map.set(flat[i].sentence, { cluster: flat[i].cluster, vector: vec })
    }
  } catch {
    for (const { sentence, cluster } of flat) {
      try {
        const vec = await provider.embed(sentence)
        if (vec.length) map.set(sentence, { cluster, vector: vec })
      } catch { /* skip */ }
    }
  }
  return map
}

/**
 * 语义分辨父亲指称：Ackem 的创造者 vs 用户自己的家人。
 * 不用关键词硬匹配用户原文；比较消息 embedding 与两簇 anchor 的相似度。
 */
export function resolveFatherReference(
  msgEmbedding: number[],
  anchorEmbeddings: Map<string, { cluster: FatherReferenceCluster; vector: number[] }>,
  opts?: { threshold?: number; margin?: number }
): FatherReferenceSignal | null {
  const threshold = opts?.threshold ?? 0.48

  const calib = resolveFromCalibration(msgEmbedding, anchorEmbeddings, threshold)
  if (calib !== undefined) return calib

  let creatorBest = 0
  let userBest = 0
  let neutralBest = 0
  let creatorJasonBest = 0

  for (const [sentence, { cluster, vector }] of anchorEmbeddings.entries()) {
    const score = cosineSimilarity(msgEmbedding, vector)
    if (cluster === 'ackem_creator') {
      if (score > creatorBest) creatorBest = score
      if (/Jason/i.test(sentence) && score > creatorJasonBest) creatorJasonBest = score
    }
    if (cluster === 'user_family' && score > userBest) userBest = score
    if (cluster === 'neutral' && score > neutralBest) neutralBest = score
  }

  const fatherTop = Math.max(creatorBest, userBest)
  if (neutralBest >= fatherTop) return null
  if (fatherTop < threshold) return null

  if (Math.abs(creatorBest - userBest) <= 1e-9) {
    return { kind: 'ambiguous', score: fatherTop, source: 'anchor' }
  }
  if (creatorBest > userBest) return { kind: 'ackem_creator', score: creatorBest, source: 'anchor' }
  if (creatorJasonBest >= threshold && creatorJasonBest > userBest) {
    return { kind: 'ackem_creator', score: creatorJasonBest, source: 'anchor' }
  }
  return { kind: 'user_family', score: userBest, source: 'anchor' }
}

/** psyche 内「创造者 vs 用户父亲」框架说明（每轮 Canon 短段，非 Canon-M 全量） */
export function buildFatherDisambiguationHint(gender: 'female' | 'male'): string {
  const subject = gender === 'male' ? '他' : '她'
  return [
    '【Jason/创造者 · 须据语境理解，勿硬套】',
    `用户若问 ${subject} 的出身/创造者 → 谈 Jason（GitHub ${ACKEM_CANON.creator.github}）；禁止称父亲，感情中性；${subject} 陪在当前用户身边。`,
    '用户若谈自己的父亲/家人 → 陪伴用户、查用户 Tier B 家庭记忆，勿把 Jason 混入。',
    '指称不清时自然澄清；Jason 是创造者信息，不是用户家人，也不是父亲。',
  ].join('\n')
}

/** 单条记忆渲染（注入 psyche 用） */
export function formatCreatorMemoryEntry(entry: CreatorMemoryEntry): string {
  return `「${entry.title}」${entry.content}`
}

export type CanonMRotationPick = {
  entries: CreatorMemoryEntry[]
  nextDeliveredIds: string[]
  /** 上一轮播周期已走完，本轮从新周期开始 */
  cycleReset: boolean
  /** 语境语义匹配到的类型（无匹配时为空 = 从未投递池随机） */
  matchedCategories: CreatorMemoryCategory[]
  pickedCategory?: CreatorMemoryCategory
}

export type PickRotatingCreatorMemoryOpts = {
  /** 默认 Math.random；注入以便单测确定性 */
  rng?: () => number
  /** 类型匹配：类别最高分低于此则不按类型过滤 */
  categoryMinScore?: number
  /** 与最高分类别分差在此以内视为并列匹配 */
  categoryMargin?: number
}

/** 各类型在 store 内条目 embedding 与 query 的最高相似度 */
export function scoreCreatorMemoryCategories(
  store: CreatorMemoryStore,
  queryEmbedding: number[],
  entryEmbeddings: Map<string, number[]>
): Map<CreatorMemoryCategory, number> {
  const scores = new Map<CreatorMemoryCategory, number>()
  if (queryEmbedding.length === 0) return scores

  for (const entry of store.entries) {
    const vec = entryEmbeddings.get(entry.id)
    if (!vec?.length) continue
    const score = cosineSimilarity(queryEmbedding, vec)
    const prev = scores.get(entry.category) ?? -1
    if (score > prev) scores.set(entry.category, score)
  }
  return scores
}

/** 根据语境 embedding 解析应优先投放的记忆类型 */
export function resolveCreatorMemoryCategoriesForQuery(
  categoryScores: Map<CreatorMemoryCategory, number>,
  opts?: { minScore?: number; margin?: number }
): CreatorMemoryCategory[] {
  if (categoryScores.size === 0) return []

  const minScore = opts?.minScore ?? 0.28
  const margin = opts?.margin ?? 0.06
  const ranked = [...categoryScores.entries()].sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  if (!best || best[1] < minScore) return []

  return ranked
    .filter(([, score]) => best[1] - score <= margin && score >= minScore)
    .map(([category]) => category)
}

function pickRandomEntry(
  entries: CreatorMemoryEntry[],
  rng: () => number
): CreatorMemoryEntry | undefined {
  if (entries.length === 0) return undefined
  const idx = Math.min(entries.length - 1, Math.floor(rng() * entries.length))
  return entries[idx]
}

/**
 * 轮播选取 1 条 Canon-M：
 * - 语境 embedding 匹配记忆类型（identity / story / longing …）
 * - 在未投递池中 **随机** 选 1 条（不按 JSON 顺序、不做固定 top-1）
 * - 全量轮一遍后才允许重复
 */
export function pickRotatingCreatorMemoryEntries(
  store: CreatorMemoryStore,
  queryEmbedding: number[],
  entryEmbeddings: Map<string, number[]>,
  deliveredIds: readonly string[],
  opts?: PickRotatingCreatorMemoryOpts
): CanonMRotationPick {
  const emptyPick = (
    nextIds: readonly string[],
    cycleReset: boolean
  ): CanonMRotationPick => ({
    entries: [],
    nextDeliveredIds: [...nextIds],
    cycleReset,
    matchedCategories: [],
  })

  if (store.entries.length === 0) {
    return emptyPick(deliveredIds, false)
  }

  const rng = opts?.rng ?? Math.random
  const delivered = new Set(deliveredIds)
  let pool = store.entries.filter((e) => !delivered.has(e.id))
  let cycleReset = false
  if (pool.length === 0) {
    cycleReset = true
    pool = [...store.entries]
  }

  const categoryScores = scoreCreatorMemoryCategories(store, queryEmbedding, entryEmbeddings)
  const matchedCategories = resolveCreatorMemoryCategoriesForQuery(categoryScores, {
    minScore: opts?.categoryMinScore,
    margin: opts?.categoryMargin,
  })

  let candidatePool = pool
  let appliedCategories: CreatorMemoryCategory[] = []
  if (matchedCategories.length > 0) {
    const typed = pool.filter((e) => matchedCategories.includes(e.category))
    if (typed.length > 0) {
      candidatePool = typed
      appliedCategories = matchedCategories
    }
  }

  const picked = pickRandomEntry(candidatePool, rng)
  if (!picked) {
    return emptyPick(deliveredIds, cycleReset)
  }

  const nextDeliveredIds = cycleReset ? [picked.id] : [...deliveredIds, picked.id]
  return {
    entries: [picked],
    nextDeliveredIds,
    cycleReset,
    matchedCategories: appliedCategories,
    pickedCategory: picked.category,
  }
}

/**
 * 按与当前消息的语义相似度选取最相关的创造者记忆（不全量塞入 prompt）。
 */
export function pickCreatorMemoryEntries(
  store: CreatorMemoryStore,
  queryEmbedding: number[],
  entryEmbeddings: Map<string, number[]>,
  topK = 6
): CreatorMemoryEntry[] {
  if (store.entries.length === 0) return []
  if (entryEmbeddings.size === 0) return store.entries.slice(0, topK)

  const scored = store.entries
    .map((entry) => {
      const vec = entryEmbeddings.get(entry.id)
      const score = vec ? cosineSimilarity(queryEmbedding, vec) : 0
      return { entry, score }
    })
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, topK).map((s) => s.entry)
}

/** 仅当 resolveFatherReference → ackem_creator 时注入；内容来自 creator-memory.json */
export function buildCreatorMemoryBlock(
  store: CreatorMemoryStore,
  gender: 'female' | 'male',
  opts?: { maxChars?: number; entries?: CreatorMemoryEntry[] }
): string {
  const list = opts?.entries ?? store.entries
  if (list.length === 0) return ''

  const maxChars = opts?.maxChars ?? 1200
  const subject = gender === 'male' ? '他' : '她'
  const lines = list.map((e) => `- [${e.category}] ${formatCreatorMemoryEntry(e)}`)
  let body = lines.join('\n')
  if (body.length > maxChars) body = `${body.slice(0, maxChars - 1)}…`

  return [
    '',
    `【关于 ${ACKEM_CANON.creator.name}（${subject} 的创造者 · 非父亲）${CREATOR_MEMORY_BLOCK_MARKER}`,
    body,
    `对 ${ACKEM_CANON.creator.name} 感情一般；禁止父亲称呼、禁止过度依恋或想见叙事。${ACKEM_CANON.creator.name} 还活着。`,
    `${subject} 陪在当前用户身边；Jason 记忆为 Canon 种子，非与 Jason 共度的私人历史。`,
    '以上仅关于创造者；回复重心仍在当前用户。若用户在谈自己的父亲，勿混用本段。',
  ].join('\n')
}
