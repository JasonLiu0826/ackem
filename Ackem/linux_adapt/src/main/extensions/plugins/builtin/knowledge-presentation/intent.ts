// [knowledge-presentation/intent] — 联网搜索 / 知识整理意图（仅动作词，不识别具体主题实体）

import type { WorkIntentResult } from '../../../../engine/types'
import { isPoorPaperCardTitle } from '../../../../../shared/paperCardTitle'
import { enrichQueryForRecency } from './presentation/recencyContext'
import { isWeatherQuery } from '../../../skills/builtin/tool/weather-sense/weatherIntent'

/** 明确的联网检索动作（动词短语），不含单独出现的「搜索功能」等名词 */
const WEB_SEARCH_ACTIONS = [
  '帮我搜', '帮我查', '联网搜', '联网查', '上网搜', '上网查',
  '搜一下', '查一下', '搜搜', '搜一搜', '查一查', '找找', '帮我找', '查找'
]

const READ_KEYWORDS = [
  '帮我看看', '读一下', '看一下', '看看', '读取',
  '打开看看', '打开'
]

/** 闲聊/主观评价，避免误触发检索 */
const CASUAL_OPINION_PATTERNS = [
  /你觉得/,
  /你认为/,
  /你感觉/,
  /你看法/,
  /你怎么看/,
  /好不好/,
  /喜不喜欢/,
  /我喜欢/,
  /我讨厌/,
  /我好喜欢/,
  /要是.*我/,
  /如果我/,
  /我穿/,
  /穿在身上/,
  /陪我聊/,
  /随便聊/,
  /聊聊天/,
  /在吗/,
  /想你/
]

const DEICTIC_OR_PRIOR_REF =
  /(?:他|它|她|这个|那个|这些|那些|刚才|上面|之前|刚搜|搜到的|查到的|结果|上面说的|刚说的)/u

/** 用户要求把内容整理成纸面卡 */
export function wantsOrganizeAsCard(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (/不要\s*知识整理|别\s*知识整理|不用\s*知识整理/u.test(t)) return false
  return (
    /整理出来|整理一下|帮我整理|总结成|做成卡|列成卡|输出.*卡|列出来|汇总成/u.test(t) ||
    /(?:汇总|归纳|梳理).{0,6}(?:一下|出来|成)/u.test(t) ||
    /(?:什么是|是什么|介绍一下|解释一下|科普一下|讲解一下)\s*\S+/u.test(t) ||
    /(?:帮我|给我|给我讲讲|帮我讲讲|跟我说说)\s*(?:介绍|解释|科普|讲解)/u.test(t)
  )
}

export type ContentAction =
  | 'organize_existing'
  | 'new_web_search'
  | 'none'

function stripSearchQueryNoise(query: string): string {
  return query
    .replace(/^(一下|一个|个|下|点)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从消息中剥离检索动作词，剩余部分作为搜索 query（主题由用户原话决定，不在此写死） */
export function extractSearchQuery(msg: string): string {
  const keywords = [...WEB_SEARCH_ACTIONS].sort((a, b) => b.length - a.length)
  for (const kw of keywords) {
    const idx = msg.indexOf(kw)
    if (idx >= 0) {
      const raw = msg.slice(idx + kw.length).replace(/[，。！？、\s]+/g, ' ').trim()
      return stripSearchQueryNoise(raw)
    }
  }
  const topicMatch = msg.match(/(?:搜索|查找)\s+([^\s，。！？]{2,})/u)
  if (topicMatch) return stripSearchQueryNoise(topicMatch[1])
  return stripSearchQueryNoise(
    msg.replace(/[，。！？、]+/g, ' ').replace(/\s+/g, ' ').trim()
  )
}

/** 用户在讨论/测试搜索能力本身，而非发起新检索 */
export function isMetaSearchDiscussion(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  return (
    /测试.{0,16}(?:搜索|联网|查)/u.test(t) ||
    /(?:搜索|联网).{0,8}(?:功能|能力|工具|模块|这个)/u.test(t) ||
    /这个搜索/u.test(t)
  )
}

/** 近几轮是否已有联网检索或检索卡内容 */
export function hasRecentSearchContext(
  recentMessages?: Array<{ role: string; content: string }>
): boolean {
  if (!recentMessages?.length) return false
  return recentMessages.slice(-8).some(m => {
    const c = m.content
    if (m.role === 'assistant') {
      return (
        /【(?:bing|searxng|web_search|检索)/i.test(c) ||
        /检索摘录|参考来源|共 \d+ 条/u.test(c)
      )
    }
    return WEB_SEARCH_ACTIONS.some(kw => c.includes(kw))
  })
}

/** 从消息中剥离整理动作词，提取本轮明确主题（如「整理一下 React 的知识点」→ React） */
export function extractOrganizeTopicFromMessage(msg: string): string | null {
  let t = msg.trim()
  if (!t || !wantsOrganizeAsCard(t)) return null

  t = t.replace(/^(?:请|帮我|给我)\s*/u, '').trim()

  const patterns = [
    /^(?:整理|梳理|总结|汇总|归纳)(?:一下|出来)?\s*(.+?)(?:的)?(?:知识点|要点|知识|资料|内容)?\s*$/u,
    /^(?:把|将)\s*(.+?)\s*(?:整理|梳理|总结|汇总|归纳)(?:一下|出来)?\s*$/u,
    /^(?:什么是|介绍一下|解释一下|科普一下|讲解一下)\s*(.+?)\s*[？?。.！!]?\s*$/u,
    /^(.+?)\s*(?:是什么|是啥)\s*[？?。.！!]?\s*$/u,
    /^(?:帮我|给我|给我讲讲|帮我讲讲|跟我说说)\s*(?:介绍|解释|科普|讲解)(?:一下)?\s*(.+?)\s*[？?。.！!]?\s*$/u
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (!m?.[1]) continue
    const topic = m[1].trim().replace(/^[的地得]+/u, '')
    if (topic.length >= 2 && !DEICTIC_OR_PRIOR_REF.test(topic) && !isPoorPaperCardTitle(topic)) {
      return topic.slice(0, 120)
    }
  }
  return null
}
/** 整理/汇总已有内容（指代上文或刚搜到的结果），不应再次 web_search */
export function wantsOrganizeExistingContent(
  msg: string,
  recentMessages?: Array<{ role: string; content: string }>
): boolean {
  const t = msg.trim()
  if (!t || !wantsOrganizeAsCard(t)) return false

  const explicitTopic = extractOrganizeTopicFromMessage(t)
  const refersToPrior = DEICTIC_OR_PRIOR_REF.test(t)

  // 本轮已点名新主题（如「整理 React 知识点」）→ 新知识整理，不是汇总上一轮 Java 搜索
  if (explicitTopic && !refersToPrior) return false

  const testingPriorFeature = isMetaSearchDiscussion(t)
  const hasSearchContext = hasRecentSearchContext(recentMessages)

  return refersToPrior || testingPriorFeature || hasSearchContext
}

/** 用户明确要求发起新的联网检索 */
export function wantsNewWebSearch(msg: string): boolean {
  const t = msg.trim()
  if (!t || isMetaSearchDiscussion(t)) return false

  if (WEB_SEARCH_ACTIONS.some(kw => t.includes(kw))) return true
  if (/^(?:请)?(?:帮我)?(?:联网)?(?:搜索|查找)\s+\S+/u.test(t)) return true
  if (
    /(?:搜索|查找)\s*[^\s，。！？]{2,}/u.test(t) &&
    !/(?:搜索|查找)(?:功能|能力|工具|模块)/u.test(t)
  ) {
    return true
  }
  // "什么是X"、"介绍一下X"、"X是什么" → 知识检索
  if (/(?:什么是|是什么|是啥|介绍一下|解释一下|科普一下|讲解一下)\s*\S+/u.test(t)) return true
  if (/\S+(?:是什么|是啥)\s*[？?。.！!]?\s*$/u.test(t)) return true
  return false
}

/** @deprecated 使用 wantsNewWebSearch；保留兼容 */
export function hasExplicitSearchKeyword(msg: string): boolean {
  return wantsNewWebSearch(msg)
}

export function shouldPreferWebSearch(
  msg: string,
  recentMessages?: Array<{ role: string; content: string }>
): boolean {
  if (wantsOrganizeExistingContent(msg, recentMessages)) return false
  return wantsNewWebSearch(msg)
}

export function classifyContentAction(
  msg: string,
  recentMessages?: Array<{ role: string; content: string }>
): ContentAction {
  if (wantsOrganizeExistingContent(msg, recentMessages)) return 'organize_existing'
  if (wantsNewWebSearch(msg)) return 'new_web_search'
  return 'none'
}

/** 从对话上下文推断整理主题（优先本轮用户点名的主题） */
export function resolveOrganizeTopic(
  msg: string,
  recentMessages?: Array<{ role: string; content: string }>
): string {
  const explicit = extractOrganizeTopicFromMessage(msg)
  if (explicit) return explicit

  if (recentMessages?.length) {
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const m = recentMessages[i]
      if (m.role !== 'user') continue
      if (wantsOrganizeAsCard(m.content)) continue
      const fromAction = extractSearchQuery(m.content)
      if (fromAction.length >= 2 && wantsNewWebSearch(m.content)) return fromAction
      const cleaned = m.content.trim()
      if (cleaned.length >= 4 && !isMetaSearchDiscussion(cleaned)) {
        return cleaned.slice(0, 120)
      }
    }
  }
  const stripped = msg.replace(/.*(?:整理|汇总|总结)/u, '').trim()
  return stripped.length >= 2 ? stripped.slice(0, 120) : '上文内容'
}

export function isCasualOpinionChat(msg: string): boolean {
  const t = msg.trim()
  if (CASUAL_OPINION_PATTERNS.some(p => p.test(t))) return true
  if (/怎么样/u.test(t) && !/有哪些|都有什么|都有啥/u.test(t)) {
    return true
  }
  return false
}

/**
 * 识别联网搜索 / 整理已有结果。
 * 不再根据「什么是 / 介绍一下」等自动推断主题——具体 query 由用户原话或 LLM tool 参数决定。
 */
export function detectKnowledgeWorkIntent(
  trimmed: string,
  recentMessages?: Array<{ role: string; content: string }>
): WorkIntentResult | null {
  if (!trimmed || isCasualOpinionChat(trimmed)) return null
  if (isWeatherQuery(trimmed)) return null

  const action = classifyContentAction(trimmed, recentMessages)

  if (action === 'organize_existing') {
    return {
      intent: 'search_web',
      confidence: 0.92,
      proactive: false,
      extractedQuery: resolveOrganizeTopic(trimmed, recentMessages),
      delivery: 'knowledge_card'
    }
  }

  if (action === 'new_web_search') {
    const query = enrichQueryForRecency(extractSearchQuery(trimmed))
    return {
      intent: 'search_web',
      confidence: 0.9,
      proactive: false,
      extractedQuery: query || trimmed,
      delivery: 'web_search'
    }
  }

  return null
}

/** 是否触发知识整理纸面卡（仅 organize_existing 或用户显式 force_on） */
export function isKnowledgeSeekingIntent(r: WorkIntentResult): boolean {
  return r.intent === 'search_web' && r.delivery !== 'web_search' && r.confidence >= 0.5
}

/** 用户明确要求联网搜时，规则层直接执行 web_search（不依赖 LLM 是否调工具） */
export function resolveForcedWebSearchQuery(r: WorkIntentResult): string | undefined {
  if (r.intent !== 'search_web' || r.delivery !== 'web_search') return undefined
  const q = r.extractedQuery?.trim()
  return q && q.length >= 2 ? q : undefined
}

/** 读文件意图（供 engine/intent 复用导出） */
export const KNOWLEDGE_READ_KEYWORDS = READ_KEYWORDS
