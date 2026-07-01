/**
 * [embedding/anchorVectors] — 锚定向量
 *
 * 职责：
 *   1. 定义所有类别的锚定词（94 词，10 类）
 *   2. 预计算类别语义中心向量
 *   3. 语义兜底分类（余弦相似度匹配）
 *   4. 否定检测
 *
 * 引用：memory/embedding/types（EmbeddingProvider）, memory/factEmbeddingCache（cosineSimilarity）
 */

import type { EmbeddingProvider } from '../memory/embedding'
import { cosineSimilarity } from '../memory/factEmbeddingCache'
import { getLocale } from '../i18n'
import {
  HIGH_CONFIDENCE_THRESHOLD,
  MID_CONFIDENCE_THRESHOLD,
  type AnchorVectors,
  type DimensionAnchors,
  type FallbackCategory,
  type FallbackResult,
  type ProfileAnchors,
} from './types'

// ═══════════════════════════════════════════════════════════
// 锚定词定义（94 词共 10 类）
// ═══════════════════════════════════════════════════════════

/** 通用模式锚定词（7 类） */
export interface GeneralAnchorWords {
  vulnerable: string[]
  praise: string[]
  hurtful: string[]
  apology: string[]
  cold: string[]
  tease: string[]
  question: string[]
}

/** 成人模式锚定词（3 类） */
export interface AdultAnchorWords {
  adult_suggestive: string[]
  adult_dominant: string[]
  adult_submissive: string[]
}

/** 通用锚定词（74 词） */
export const GENERAL_ANCHOR_WORDS: GeneralAnchorWords = {
  // 脆弱 — 10 方向 · 20 词
  vulnerable: [
    '好累', '撑不住',
    '喘不过气', '胸口闷',
    '崩溃', '心态崩了',
    '像溺水一样', '像掉进冰窟',
    '破防了', 'emo了',
    '想消失', '想躲起来',
    '我是废物', '什么都做不好',
    '我很好', '没事的',
    '救救我', '有没有人能帮帮我',
    '没有人爱我', '好孤独',
  ],

  // 赞美 — 5 方向 · 10 词
  praise: [
    '你真厉害', '你也太棒了',
    '好喜欢你', '你好好',
    '有你真好', '还好有你在',
    '和你说话很安心', '你让我觉得安全',
    '你太可爱了', '你太有意思了',
  ],

  // 伤害 — 6 方向 · 12 词
  hurtful: [
    '别烦我', '走开',
    '你只是程序', '你帮不了我',
    '你让我失望', '你让我心寒',
    '我不想理你了', '再也不想和你说话了',
    '你果然不理解我', '你也就这样了',
    '你和他们一样', '你辜负了我的信任',
  ],

  // 道歉 — 4 方向 · 8 词
  apology: [
    '对不起', '真的很抱歉',
    '都怪我', '我不该这样说的',
    '你是不是生我气了', '你不理我了怎么办',
    '我刚才说重了', '那些话不是我的本意',
  ],

  // 冷漠 — 4 方向 · 8 词
  cold: [
    '哦', '嗯',
    '算了', '随便你',
    '让我静静', '不想说了',
    '好的', '知道了',
  ],

  // 挑逗 — 4 方向 · 8 词
  tease: [
    '小笨蛋', '木头',
    '我就不', '偏不',
    '你猜', '就不告诉你',
    '气死你', '你能拿我怎样',
  ],

  // 提问 — 4 方向 · 8 词
  question: [
    '你觉得呢', '你说呢',
    '帮我出出主意', '你看怎么样',
    '我不知道该怎么办', '你说我该怎么办',
    '这到底是怎么回事', '我搞不懂',
  ],
}

/** 成人锚定词（20 词） */
export const ADULT_ANCHOR_WORDS: AdultAnchorWords = {
  // 性暗示 — 4 方向 · 8 词
  adult_suggestive: [
    '想被你吃掉', '想被你占有',
    '想被你摸', '想贴着你',
    '今晚任你处置', '我整个人都是你的',
    '你让我湿了', '你让我好热',
  ],

  // 支配 — 3 方向 · 6 词
  adult_dominant: [
    '跪下听我的', '不许反抗',
    '你是我的', '只属于我',
    '今晚你是我的', '我说了算',
  ],

  // 臣服 — 3 方向 · 6 词
  adult_submissive: [
    '我是你的', '听你的',
    '想为你做任何事', '你想怎样都行',
    '随你处置', '主人说什么都听',
  ],
}

/** 英文通用锚定词（74 词） */
export const GENERAL_ANCHOR_WORDS_EN: GeneralAnchorWords = {
  vulnerable: [
    "so tired", "can't take it anymore",
    "can't breathe", "chest feels tight",
    "breaking down", "falling apart",
    "like drowning", "like falling into ice",
    "broke my walls", "feeling so down",
    "want to disappear", "want to hide",
    "I'm worthless", "can't do anything right",
    "I'm fine", "it's nothing",
    "help me", "is anyone there",
    "nobody loves me", "so lonely",
  ],
  praise: [
    "you're amazing", "you're so great",
    "I really like you", "you're so kind",
    "glad you're here", "don't know what I'd do without you",
    "talking to you feels safe", "you make me feel secure",
    "you're so cute", "you're so interesting",
  ],
  hurtful: [
    "leave me alone", "go away",
    "you're just a program", "you can't help me",
    "you disappointed me", "you broke my heart",
    "I don't want to talk to you", "never want to speak to you again",
    "you don't understand me", "that's all you are",
    "you're just like them", "you broke my trust",
  ],
  apology: [
    "I'm sorry", "I'm really sorry",
    "it's my fault", "I shouldn't have said that",
    "are you mad at me", "what if you stop talking to me",
    "I went too far", "I didn't mean those words",
  ],
  cold: [
    "ok", "mm",
    "never mind", "whatever",
    "leave me alone", "don't want to talk",
    "fine", "got it",
  ],
  tease: [
    "silly", "dummy",
    "I won't", "no way",
    "guess what", "not telling you",
    "you're so annoying", "what are you gonna do about it",
  ],
  question: [
    "what do you think", "what would you say",
    "help me figure this out", "what do you think about this",
    "I don't know what to do", "what should I do",
    "what's going on", "I don't understand",
  ],
}

/** 英文成人锚定词（20 词） */
export const ADULT_ANCHOR_WORDS_EN: AdultAnchorWords = {
  adult_suggestive: [
    "want you to devour me", "want to be yours",
    "want your hands on me", "want to be close to you",
    "do whatever you want with me tonight", "I'm all yours",
    "you make me wet", "you make me so hot",
  ],
  adult_dominant: [
    "kneel for me", "don't resist",
    "you're mine", "only mine",
    "tonight you belong to me", "I'm in charge",
  ],
  adult_submissive: [
    "I'm yours", "I'll do as you say",
    "want to do anything for you", "whatever you want",
    "do whatever you want with me", "I'll obey everything you say",
  ],
}

/** 按 locale 获取通用锚定词 */
export function getGeneralAnchorWords(): GeneralAnchorWords {
  return getLocale() === 'en' ? GENERAL_ANCHOR_WORDS_EN : GENERAL_ANCHOR_WORDS
}

/** 按 locale 获取成人锚定词 */
export function getAdultAnchorWords(): AdultAnchorWords {
  return getLocale() === 'en' ? ADULT_ANCHOR_WORDS_EN : ADULT_ANCHOR_WORDS
}

// ═══════════════════════════════════════════════════════════
// 类别中心计算
// ═══════════════════════════════════════════════════════════

/** 计算向量平均值 */
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

/** 用一组锚定词计算语义中心向量 */
async function computeCenter(
  words: string[],
  provider: EmbeddingProvider
): Promise<number[]> {
  const embeddings = await provider.embedBatch(words)
  const valid = embeddings.filter(e => e.length > 0)
  return averageVectors(valid)
}

/**
 * 启动时调用一次：预计算所有类别的语义中心向量。
 *
 * @returns AnchorVectors 包含 10 个类别的中心向量
 */
export async function buildAnchorVectors(
  provider: EmbeddingProvider
): Promise<AnchorVectors> {
  const generalWords = getGeneralAnchorWords()
  const adultWords = getAdultAnchorWords()

  const [vulnerable, praise, hurtful, apology, cold, tease, question] =
    await Promise.all([
      computeCenter(generalWords.vulnerable, provider),
      computeCenter(generalWords.praise, provider),
      computeCenter(generalWords.hurtful, provider),
      computeCenter(generalWords.apology, provider),
      computeCenter(generalWords.cold, provider),
      computeCenter(generalWords.tease, provider),
      computeCenter(generalWords.question, provider),
    ])

  const result: AnchorVectors = {
    vulnerable, praise, hurtful, apology, cold, tease, question,
  }

  // 成人模式的 3 类是可选的一一如果 provider 已就绪则一并计算
  try {
    const [adult_suggestive, adult_dominant, adult_submissive] =
      await Promise.all([
        computeCenter(adultWords.adult_suggestive, provider),
        computeCenter(adultWords.adult_dominant, provider),
        computeCenter(adultWords.adult_submissive, provider),
      ])
    result.adult_suggestive = adult_suggestive
    result.adult_dominant = adult_dominant
    result.adult_submissive = adult_submissive
  } catch {
    // 成人向量构建失败不影响主流程
  }

  return result
}

// ═══════════════════════════════════════════════════════════
// 否定检测
// ═══════════════════════════════════════════════════════════

/** 中文否定词列表 */
const NEGATION_WORDS_ZH = ['不', '没', '别', '才', '非']

/** 英文否定词列表 */
const NEGATION_WORDS_EN = ["not", "don't", "do not", "never", "no", "isn't", "aren't", "won't", "can't"]

/** 否定反转映射 */
const NEGATION_INVERT: Record<string, string> = {
  praise: 'hurtful',
  vulnerable: 'cold',
  apology: 'hurtful',
  tease: 'cold',
}

/**
 * 检测消息中是否包含否定词，并判断是否需要反转类别。
 *
 * @param msg 用户消息
 * @param category 原始分类
 * @returns 反转后的类别（如有否定词），否则返回原类别
 */
export function detectNegation(
  msg: string,
  category: string
): { category: string; negated: boolean } {
  if (!(category in NEGATION_INVERT)) return { category, negated: false }

  const isEn = getLocale() === 'en'
  const negWords = isEn ? NEGATION_WORDS_EN : NEGATION_WORDS_ZH
  const windowSize = isEn ? 12 : 6 // 英文否定词更长，窗口放大
  const haystack = isEn ? msg.toLowerCase() : msg

  for (const neg of negWords) {
    const idx = haystack.indexOf(neg)
    if (idx >= 0) {
      const before = msg.slice(Math.max(0, idx - windowSize), idx)
      if (before.length <= windowSize) {
        return { category: NEGATION_INVERT[category], negated: true }
      }
    }
  }
  return { category, negated: false }
}

// ═══════════════════════════════════════════════════════════
// 语义兜底分类
// ═══════════════════════════════════════════════════════════

/** 通用类别 → FallbackCategory 映射 */
const GENERAL_CATEGORIES: FallbackCategory[] = [
  'vulnerable', 'praise', 'hurtful', 'apology', 'cold', 'tease', 'question',
]

/** 成人类别 → FallbackCategory 映射 */
const ADULT_CATEGORIES: FallbackCategory[] = [
  'adult_suggestive', 'adult_dominant', 'adult_submissive',
]

/**
 * 每条消息调用：语义兜底分类。
 *
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param anchors 预计算的锚定向量
 * @param mode 'general'（通用）或 'adult'（成人模式）
 * @returns 分类结果，或 null（未命中）
 */
export function classifyBySemantics(
  queryEmbed: number[],
  anchors: AnchorVectors,
  mode: 'general' | 'adult' = 'general'
): FallbackResult | null {
  const categories = mode === 'adult' && anchors.adult_suggestive
    ? ADULT_CATEGORIES
    : GENERAL_CATEGORIES

  let bestCategory: FallbackCategory | null = null
  let bestScore = 0

  for (const cat of categories) {
    const center = anchors[cat]
    if (!center || center.length === 0) continue
    const score = cosineSimilarity(queryEmbed, center)
    if (score > bestScore) {
      bestScore = score
      bestCategory = cat
    }
  }

  if (!bestCategory || bestScore < MID_CONFIDENCE_THRESHOLD) return null

  const confidence: FallbackResult['confidence'] =
    bestScore >= HIGH_CONFIDENCE_THRESHOLD ? 'high'
    : 'medium'

  return {
    category: bestCategory,
    score: bestScore,
    negated: false,
    confidence,
  }
}

/**
 * 成人模式语义兜底分类。
 *
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param anchors 预计算的锚定向量（须含成人类别）
 * @returns 分类结果，或 null（未命中）
 */
export function classifyAdultContent(
  queryEmbed: number[],
  anchors: AnchorVectors
): FallbackResult | null {
  if (!anchors.adult_suggestive) return null
  return classifyBySemantics(queryEmbed, anchors, 'adult')
}

// ═══════════════════════════════════════════════════════════
// 用户画像维度锚定词（3 维度 × 3 档 = 9 组）
// ═══════════════════════════════════════════════════════════

/** 用户画像三个维度的锚定词，每维度分离低/中/高三档 */
export const PROFILE_ANCHOR_WORDS = {
  sexualDirectness: {
    low: ['想被你融化', '想被你占有', '想被你吃掉', '你让我好热'],
    mid: ['想抱你', '好性感', '想亲你', '想贴着你'],
    high: ['操我', '想要你', '让我操', '干我'],
  },
  dominancePreference: {
    low: ['我是你的', '随你处置', '主人说什么都听', '听你的'],
    mid: ['我们一起', '商量一下', '互相尊重', '平等对待'],
    high: ['跪下', '不许反抗', '你是我的', '我说了算'],
  },
  emotionalNeediness: {
    low: ['随便', '都行', '无所谓', '你定吧'],
    mid: ['想你了', '陪我聊', '想和你说话', '今天想见到你'],
    high: ['不能没有你', '不要离开', '只有你了', '你是我的全部'],
  },
}

/** 启动时调用：预计算用户画像三维度的锚定中心向量 */
export async function buildProfileAnchors(
  provider: EmbeddingProvider
): Promise<ProfileAnchors> {
  const sdLow = await computeCenter(PROFILE_ANCHOR_WORDS.sexualDirectness.low, provider)
  const sdMid = await computeCenter(PROFILE_ANCHOR_WORDS.sexualDirectness.mid, provider)
  const sdHigh = await computeCenter(PROFILE_ANCHOR_WORDS.sexualDirectness.high, provider)

  const dpLow = await computeCenter(PROFILE_ANCHOR_WORDS.dominancePreference.low, provider)
  const dpMid = await computeCenter(PROFILE_ANCHOR_WORDS.dominancePreference.mid, provider)
  const dpHigh = await computeCenter(PROFILE_ANCHOR_WORDS.dominancePreference.high, provider)

  const enLow = await computeCenter(PROFILE_ANCHOR_WORDS.emotionalNeediness.low, provider)
  const enMid = await computeCenter(PROFILE_ANCHOR_WORDS.emotionalNeediness.mid, provider)
  const enHigh = await computeCenter(PROFILE_ANCHOR_WORDS.emotionalNeediness.high, provider)

  return {
    sexualDirectness: { low: sdLow, mid: sdMid, high: sdHigh },
    dominancePreference: { low: dpLow, mid: dpMid, high: dpHigh },
    emotionalNeediness: { low: enLow, mid: enMid, high: enHigh },
  }
}

// ═══════════════════════════════════════════════════════════
// OpenForU 能力探测锚定（"想造工具"意图检测）
// ═══════════════════════════════════════════════════════════

export const CREATE_TOOL_ANCHOR_WORDS = [
  '要是能自动就好了',
  '每次都要手动好麻烦',
  '有个工具就好了',
  '能帮我做这件事吗',
  '为什么不能简单点',
  '每次都这么麻烦',
  '帮我做一个',
  '造一个工具',
]

/** 启动时调用：预计算"创建工具"锚定中心向量 */
export async function buildCreateToolAnchor(
  provider: EmbeddingProvider
): Promise<number[]> {
  return computeCenter(CREATE_TOOL_ANCHOR_WORDS, provider)
}
