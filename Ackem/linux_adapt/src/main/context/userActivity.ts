import type {
  ActivityTense,
  TimeRuntimeContext,
  UserActivityCategory,
  UserActivityContext
} from './types'
import {
  resolveActivityFromTemporalFacts,
  type TemporalFactRef
} from './planDateWindow'

export type ResolveUserActivityInput = {
  recentUserSnippets: string[]
  memoryFactSummaries?: string[]
  /** CTX-B：带 subcategory 的 PLANS / COMMITMENTS */
  temporalFacts?: TemporalFactRef[]
  time: TimeRuntimeContext
  gameActive?: boolean
  now?: Date
}

type CategoryRule = {
  category: UserActivityCategory
  keywords: string[]
  weight: number
}

const CATEGORY_RULES: CategoryRule[] = [
  { category: 'travel', keywords: ['旅游', '出游', '出差', '出发', '到了', '景点', '酒店', '航班', '刚回'], weight: 3 },
  { category: 'study', keywords: ['学习', '复习', '考试', '作业', '上课', '论文', '备考', '考研'], weight: 3 },
  { category: 'work', keywords: ['工作', '加班', '开会', '项目', 'ddl', '上班', '办公', '赶工', 'deadline', '下班'], weight: 3 },
  { category: 'entertainment', keywords: ['游戏', '打游戏', 'minecraft', 'mc', '追剧', '看电影', '副本', 'steam'], weight: 3 },
  { category: 'social', keywords: ['聚会', '约会', '陪爸', '陪妈', '朋友', '见面', '聚餐'], weight: 2 },
  { category: 'health', keywords: ['健身', '医院', '跑步', '运动', '锻炼', '看病'], weight: 3 },
  { category: 'rest', keywords: ['睡觉', '休息', '累了', '熬夜', '补觉', '困'], weight: 2 },
  { category: 'daily', keywords: ['吃饭', '通勤', '买菜', '家务', '做饭', '外卖'], weight: 1 }
]

const FUTURE_MARKERS = ['明天', '下周', '打算', '计划', '要去', '准备', '即将', '后天']
const PAST_MARKERS = ['刚', '结束', '昨天', '刚才', '玩完', '刚回', '刚结束', '回来']
const PRESENT_MARKERS = ['正在', '在写', '在玩', '路上', '到了', '现在']

const CATEGORY_LABEL: Record<UserActivityCategory, string> = {
  rest: '休息',
  work: '工作',
  study: '学习',
  travel: '出游',
  social: '社交',
  entertainment: '娱乐',
  daily: '日常',
  health: '健康',
  unknown: '未知'
}

const TENSE_LABEL: Record<ActivityTense, string> = {
  future: '将来',
  present: '进行中',
  past: '刚结束'
}

function corpus(input: ResolveUserActivityInput): string {
  const parts = [...input.recentUserSnippets, ...(input.memoryFactSummaries ?? [])]
  return parts.join(' ').toLowerCase()
}

function scoreCategories(text: string): Map<UserActivityCategory, number> {
  const scores = new Map<UserActivityCategory, number>()
  for (const rule of CATEGORY_RULES) {
    let hit = 0
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) hit += rule.weight
    }
    if (hit > 0) scores.set(rule.category, (scores.get(rule.category) ?? 0) + hit)
  }
  return scores
}

function resolveTense(text: string, category: UserActivityCategory): ActivityTense {
  const hasFuture = FUTURE_MARKERS.some(m => text.includes(m))
  const hasPast = PAST_MARKERS.some(m => text.includes(m))
  const hasPresent = PRESENT_MARKERS.some(m => text.includes(m))

  if (category === 'travel') {
    if (hasFuture) return 'future'
    if (hasPast || text.includes('刚回') || text.includes('回来')) return 'past'
    if (hasPresent || text.includes('到了') || text.includes('路上')) return 'present'
  }

  if (hasFuture && !hasPast) return 'future'
  if (hasPast && !hasFuture) return 'past'
  if (hasPresent) return 'present'
  return 'present'
}

function weekdayWorkPrior(time: TimeRuntimeContext): UserActivityCategory | null {
  if (time.isWeekend) return null
  if (time.hour >= 9 && time.hour < 18) return 'work'
  return null
}

function buildLabel(category: UserActivityCategory, tense: ActivityTense): string {
  if (category === 'unknown') return '暂无法判断用户在做什么'
  return `${CATEGORY_LABEL[category]}·${TENSE_LABEL[tense]}`
}

function collectSources(
  text: string,
  category: UserActivityCategory,
  gameActive: boolean
): string[] {
  const sources: string[] = []
  if (gameActive) sources.push('gamemode:active')
  for (const rule of CATEGORY_RULES) {
    if (rule.category !== category) continue
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      sources.push(`keyword:${rule.category}`)
      break
    }
  }
  if (sources.length === 0 && category !== 'unknown') sources.push('time:heuristic')
  return sources
}

const PLAN_OVERRIDE_MIN_CONFIDENCE = 0.7

/** 规则推断用户生活场景大类 + 时态（v1 关键词 + CTX-B 记忆日期窗） */
export function resolveUserActivity(input: ResolveUserActivityInput): UserActivityContext {
  const now = input.now ?? new Date()

  if (input.gameActive) {
    return {
      category: 'entertainment',
      tense: 'present',
      label: buildLabel('entertainment', 'present'),
      confidence: 0.85,
      source: ['gamemode:active']
    }
  }

  const fromPlans =
    input.temporalFacts && input.temporalFacts.length > 0
      ? resolveActivityFromTemporalFacts(input.temporalFacts, now)
      : null

  const text = corpus(input)
  const scores = scoreCategories(text)
  let category: UserActivityCategory = 'unknown'
  let best = 0

  for (const [cat, score] of scores) {
    if (score > best) {
      best = score
      category = cat
    }
  }

  if (category === 'unknown') {
    const prior = weekdayWorkPrior(input.time)
    if (prior) {
      category = prior
      best = 1
    }
  }

  if (category === 'unknown') {
    if (fromPlans && fromPlans.confidence >= PLAN_OVERRIDE_MIN_CONFIDENCE) {
      return fromPlans
    }
    return {
      category: 'unknown',
      tense: 'present',
      label: buildLabel('unknown', 'present'),
      confidence: 0,
      source: ['insufficient']
    }
  }

  const tense = resolveTense(text, category)
  let confidence = Math.min(0.95, 0.35 + best * 0.12)
  let result: UserActivityContext = {
    category,
    tense,
    label: buildLabel(category, tense),
    confidence: Math.round(confidence * 100) / 100,
    source: collectSources(text, category, false)
  }

  if (
    fromPlans &&
    fromPlans.confidence >= PLAN_OVERRIDE_MIN_CONFIDENCE &&
    fromPlans.confidence > result.confidence
  ) {
    result = fromPlans
  }

  return result
}
