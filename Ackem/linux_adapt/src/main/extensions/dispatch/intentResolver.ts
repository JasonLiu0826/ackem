// [intentResolver] — 上下文感知意图消解
// 职责：维护话题栈、检测歧义消息、按需 LLM 消解
// 设计：歧义检测纯规则 <0.1ms，LLM 消解仅在歧义+有话题时触发

import type { LlmClient } from '../../engine/types'
import { createLogger } from '../../logger'

const log = createLogger('intent-resolver')

// ═══ 话题栈 ═══

export interface TopicEntry {
  /** 话题关键词（如 "loop"、"量子计算"） */
  topic: string
  /** 来源：哪个扩展/动作触发的 */
  source: string
  /** 时间戳 */
  ts: number
}

const topicStacks = new Map<string, TopicEntry>()
const TOPIC_TTL_MS = 10 * 60_000 // 10 分钟过期

export function pushTopic(sessionId: string, topic: string, source: string): void {
  topicStacks.set(sessionId, { topic, source, ts: Date.now() })
  log.info('topic pushed', { sessionId, topic, source })
}

export function getTopic(sessionId: string): TopicEntry | undefined {
  const entry = topicStacks.get(sessionId)
  if (!entry) return undefined
  if (Date.now() - entry.ts > TOPIC_TTL_MS) {
    topicStacks.delete(sessionId)
    return undefined
  }
  return entry
}

export function clearTopic(sessionId: string): void {
  topicStacks.delete(sessionId)
}

// ═══ 歧义检测（纯规则，<0.1ms）═══

/** 指示词/回指词模式 */
const DEICTIC_PATTERN =
  /^(?:呢|这个|那个|它|她|他|这些|那些|继续|然后|接着|上面|刚才|之前|再|还|又|同样|也是)\s*[？?。.！!]?\s*$/u

/** 短句 + 包含指示词 */
const SHORT_DEICTIC_PATTERN =
  /^(?:.{1,6})(?:呢|这个|那个|它|继续|然后|接着|再|还)\s*[？?。.！!]?\s*$/u

/** 纯问句但无明确名词主语 */
const BARE_QUESTION_PATTERN = /^[怎么什么哪谁为啥如何].{0,6}[？?]?\s*$/u

/**
 * 检测消息是否歧义（需要上下文消解）。
 * 返回 true 表示需要 LLM 消解。
 */
export function isAmbiguous(msg: string): boolean {
  const t = msg.trim()
  if (!t || t.length > 30) return false // 太长的句子通常不歧义

  // 纯指示词/回指词
  if (DEICTIC_PATTERN.test(t)) return true

  // 短句含指示词
  if (t.length <= 8 && SHORT_DEICTIC_PATTERN.test(t)) return true

  // 裸问句（"怎么了？""啥呢？"）
  if (t.length <= 6 && BARE_QUESTION_PATTERN.test(t)) return true

  // 以"呢"结尾的短句（"整理一下呢？""那个呢？"）
  if (t.length <= 10 && /[呢][？?。.！!]?\s*$/u.test(t)) return true

  return false
}

// ═══ LLM 消解 ═══

const RESOLVE_PROMPT_TEMPLATE = `你是对话意图消解器。给定最近话题和用户的歧义短句，输出用户真正想说的完整句子。

规则：
- 只输出消解后的完整句子，不要解释
- 如果无法消解，原样输出用户消息
- 不要添加用户没有表达的意思

最近话题：{topic}
用户消息："{msg}"
消解后：`

const RESOLVE_MAX_TOKENS = 60

/**
 * 用 LLM 消解歧义消息。
 * 只在 isAmbiguous() 返回 true 且有话题时调用。
 */
async function resolveWithLlm(
  msg: string,
  topic: string,
  llm: LlmClient
): Promise<string> {
  const prompt = RESOLVE_PROMPT_TEMPLATE
    .replace('{topic}', topic)
    .replace('{msg}', msg)

  try {
    const result = await llm.chatCompletionJson({
      messages: [
        { role: 'system', content: '只输出消解后的句子，不要任何解释或标点以外的内容。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: RESOLVE_MAX_TOKENS
    })
    const resolved = result.trim().replace(/^["']|["']$/g, '')
    log.info('intent resolved', { original: msg, topic, resolved })
    return resolved || msg
  } catch (e) {
    log.warn('intent resolution failed', { error: String(e) })
    return msg
  }
}

// ═══ 主入口 ═══

export interface ResolveResult {
  /** 消解后的消息（用于 dispatch 匹配和 query 提取） */
  resolvedMessage: string
  /** 原始消息是否被判定为歧义 */
  wasAmbiguous: boolean
  /** 是否进行了 LLM 消解 */
  wasResolved: boolean
}

/**
 * 意图消解主入口。
 *
 * @param msg 原始用户消息
 * @param sessionId 当前会话 ID
 * @param llm LLM 客户端（仅歧义时调用）
 * @returns 消解结果
 */
export async function resolveIntent(
  msg: string,
  sessionId: string,
  llm?: LlmClient
): Promise<ResolveResult> {
  const ambiguous = isAmbiguous(msg)

  if (!ambiguous) {
    return { resolvedMessage: msg, wasAmbiguous: false, wasResolved: false }
  }

  const topic = getTopic(sessionId)
  if (!topic || !llm) {
    return { resolvedMessage: msg, wasAmbiguous: true, wasResolved: false }
  }

  const resolved = await resolveWithLlm(msg, topic.topic, llm)
  return {
    resolvedMessage: resolved,
    wasAmbiguous: true,
    wasResolved: resolved !== msg
  }
}
