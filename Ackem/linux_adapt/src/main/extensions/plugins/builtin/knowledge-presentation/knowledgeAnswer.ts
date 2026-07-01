// [knowledge-presentation/knowledgeAnswer] — 纸面卡 + 伴侣短评（仅 LLM，不联网）

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../settings'
import { createLlmJsonClient } from '../../../../llmClient'
import type { SearchCardPayload } from '../../../../shared/searchCard'
import { buildKnowledgeL3Directive, extractL3ExpressionContext } from './l3Context'
import { extractOrganizeTopicFromMessage } from './intent'
import { pluginActivityLabel } from '../../../../chatStatusLabels'
import { recencyPromptSuffix } from './presentation/recencyContext'
import {
  ACKEM_PRODUCT_IDENTITY_GUARD,
  buildAckemCompareCardBlock,
  sanitizeAckemIdentityInMarkdown
} from '../../../../paperCard/ackemProductIdentity'
import {
  buildPaperCardCompanionUserTail,
  defaultPaperCardCompanionFallback,
  PAPER_CARD_COMPANION_SYSTEM_SUFFIX
} from '../../../../paperCardCompanionPrompt'
import { finalizePaperCardCompanionReply } from '../../../../paperCard/finalizeCompanionReply'
import { resolvePaperCardDisplayTitle } from '../../../../paperCard/resolveDisplayTitle'
import { isPoorPaperCardTitle } from '../../../../../shared/paperCardTitle'

export type KnowledgeAnswerInput = {
  topic: string
  userQuestion: string
}

export type KnowledgeAnswerOutput = {
  cardBody: string
  companionReply: string
  copyText: string
  displayTitle: string
}

const CARD_BODY_MAX_TOKENS = 3200

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

export function lastUserMessageFromContext(
  messages: Array<{ role: string; content: unknown }>
): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  return last ? messageText(last.content) : ''
}

function extractSystemFromMessages(
  messages: Array<{ role: string; content: unknown }>
): string {
  const sys = messages.find(m => m.role === 'system')
  return sys ? messageText(sys.content) : ''
}

const KNOWLEDGE_CARD_INSTRUCTIONS = `请撰写「知识整理正文」——一份可保存的认真答复，直接、完整地回答用户问题。

结构与篇幅（**硬性，缺一即失败**）：
- 全文 **至少 500 字**（建议 500～1200 字）；分 **3～6 个小节**，每节必须有简短小标题（**标题** 或 ##）
- 必须包含：概述、核心要点（≥4 条，可用列表）、版本/数据/时间线（如适用）、常见误区或补充、综合结论
- **禁止**只写一句开场白、态度宣言或「我就给你讲讲」式铺垫后结束
- 以模型可靠知识为主，**不确定处标明「可能因训练数据而滞后」**，勿编造具体网址或最新新闻日期
- 追求准确、齐全、可读，少写空话
- **不要**罗列参考链接（本产品不提供网页来源）
- **禁止**推脱式追问；**禁止**在正文末尾写「想聊可以找我慢慢拆」等闲聊邀请（那是聊天气泡的事）`

const KNOWLEDGE_CARD_RETRY_INSTRUCTIONS = `【补写/重写】上一轮输出过短或缺少小节，请 **重新输出完整正文**（不要道歉、不要解释为何上次短）。

硬性：≥500 字；≥3 个小节标题（**标题** 或 ##）；≥4 条要点；语气中性、信息密度高；禁止仅开场白。`

/** 纸面正文是否明显过短或缺少结构（用于触发补写） */
export function isKnowledgeCardBodyInsufficient(body: string): boolean {
  const t = body.trim()
  const headings = (t.match(/^#{1,3}\s+/gm) ?? []).length
  const boldTitles = (t.match(/\*\*[^*\n]{2,40}\*\*/g) ?? []).length
  const bullets = (t.match(/^[\s]*[-*•]\s+/gm) ?? []).length
  const numbered = (t.match(/^[\s]*\d+[.)．、]\s+/gm) ?? []).length
  const sectionMarkers = headings + boldTitles
  const listItems = bullets + numbered

  if (t.length >= 450 && sectionMarkers >= 2) return false
  if (sectionMarkers >= 2 && listItems >= 3 && t.length >= 200) return false
  if (t.length < 200) return true
  if (sectionMarkers < 2 && listItems < 3) return true
  return false
}

function buildCardSystemPrompt(systemContext: string): string {
  const l3 = extractL3ExpressionContext(systemContext)
  const l3Directive = buildKnowledgeL3Directive(l3, 'card_body')
  return [
    '【模块】知识整理 · 纸面正文写作（不是聊天，不要调用工具）',
    '【优先级】信息完整与结构 > 任何伴侣口吻或 Tier A 人格指令（若冲突，以本条为准）',
    l3Directive
  ].join('\n\n')
}

async function llmText(
  settings: AppSettings,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const client = createLlmJsonClient(settings)
  return (
    await client.chatCompletionJson({
      messages,
      temperature,
      max_tokens: maxTokens
    })
  ).trim()
}

async function synthesizeKnowledgeCardBody(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  topic: string
): Promise<string> {
  const l3 = extractL3ExpressionContext(systemContext)
  const cardTemp = l3 ? 0.5 : 0.42
  const cardSystem =
    buildCardSystemPrompt(systemContext) + ACKEM_PRODUCT_IDENTITY_GUARD + buildAckemCompareCardBlock(userQuestion)

  const taskUser = (instructions: string) =>
    `【知识整理任务】主题：「${topic}」\n` +
    `${recencyPromptSuffix()}\n\n` +
    instructions

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: cardSystem },
    { role: 'user', content: userQuestion },
    { role: 'user', content: taskUser(KNOWLEDGE_CARD_INSTRUCTIONS) }
  ]
  let text = await llmText(settings, messages, CARD_BODY_MAX_TOKENS, cardTemp)

  if (text && isKnowledgeCardBodyInsufficient(text)) {
    const retryMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content:
          '【模块】知识整理 · 纸面正文补写\n' +
          '上一轮过短。请输出完整、中性的说明文，忽略伴侣聊天口吻与人格开场。'
      },
      { role: 'user', content: userQuestion },
      { role: 'user', content: taskUser(KNOWLEDGE_CARD_RETRY_INSTRUCTIONS) }
    ]
    const retry = await llmText(settings, retryMessages, CARD_BODY_MAX_TOKENS, 0.35)
    if (retry && !isKnowledgeCardBodyInsufficient(retry)) text = retry
    else if (retry && retry.length > (text?.length ?? 0)) text = retry
  }

  return text || '（未能生成知识整理正文，请稍后重试。）'
}

async function synthesizeKnowledgeCompanion(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  topic: string,
  cardBody: string
): Promise<string> {
  const l3 = extractL3ExpressionContext(systemContext)
  const l3Directive = buildKnowledgeL3Directive(l3, 'companion')
  const excerpt = cardBody.length > 500 ? `${cardBody.slice(0, 500)}…` : cardBody
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        PAPER_CARD_COMPANION_SYSTEM_SUFFIX +
        '\n\n【当前任务】用户刚请你讲解/查询某话题，**完整知识整理已在纸面卡**。\n\n' +
        l3Directive
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `【背景】你刚帮用户整理好「${topic}」（见上方纸面卡）。\n` +
        `（勿复述、勿在气泡里补讲知识点）\n${excerpt}` +
        buildPaperCardCompanionUserTail('知识整理', topic)
    }
  ]
  const text = await llmText(settings, messages, 400, 0.88)
  const trimmed = text.trim()
  if (!trimmed) return defaultPaperCardCompanionFallback('知识整理')
  return finalizePaperCardCompanionReply(trimmed)
}

export function buildKnowledgeCardCopyText(displayTitle: string, cardBody: string): string {
  return `【知识整理】${displayTitle}\n${'─'.repeat(32)}\n${cardBody.trim()}`
}

export async function synthesizeKnowledgeAnswer(
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: KnowledgeAnswerInput
): Promise<KnowledgeAnswerOutput> {
  const systemContext = extractSystemFromMessages(contextMessages)
  const userQuestion = input.userQuestion.trim() || input.topic

  const cardBody = await synthesizeKnowledgeCardBody(
    settings,
    systemContext,
    userQuestion,
    input.topic
  )
  const sanitizedBody = sanitizeAckemIdentityInMarkdown(cardBody, userQuestion)
  const displayTitle = await resolvePaperCardDisplayTitle(
    settings,
    'knowledge',
    userQuestion,
    input.topic,
    sanitizedBody
  )
  const companionReply = await synthesizeKnowledgeCompanion(
    settings,
    systemContext,
    userQuestion,
    displayTitle,
    sanitizedBody
  )

  return {
    cardBody: sanitizedBody,
    companionReply,
    copyText: buildKnowledgeCardCopyText(displayTitle, cardBody),
    displayTitle
  }
}

export function toKnowledgeCardPayload(
  topic: string,
  out: KnowledgeAnswerOutput
): SearchCardPayload {
  return {
    query: topic,
    displayTitle: out.displayTitle,
    cardBody: out.cardBody,
    sources: [],
    copyText: out.copyText,
    mode: 'knowledge'
  }
}

export function resolveKnowledgeTopicLabel(
  current: string,
  recentMessages?: Array<{ role: string; content: string }>
): string {
  const t = current.trim()
  const fromOrganize = extractOrganizeTopicFromMessage(t)
  if (fromOrganize) return fromOrganize

  const core = t.replace(/\s/g, '')
  const metaOnly =
    /^(你)?(介绍介绍|介绍一下|介绍下)$/u.test(core) ||
    /^(你)?(能|可以)?介绍一下[吗呢啊呀]?$/u.test(core) ||
    core === '讲讲' ||
    core === '说说'

  if (metaOnly) {
    const users = (recentMessages || [])
      .filter(m => m.role === 'user')
      .map(m => m.content.trim())
      .filter(Boolean)
    const prev = users.length >= 2 ? users[users.length - 2] : users[0]
    if (prev && prev.length >= 4) return prev
    return t || '知识整理'
  }

  const topicAfterKw = t.match(/(?:介绍一下|讲讲|说说|科普一下)(.+)/u)
  if (topicAfterKw && topicAfterKw[1].trim().length >= 2) {
    const hit = topicAfterKw[1].trim()
    if (!isPoorPaperCardTitle(hit)) return hit
  }

  if (!isPoorPaperCardTitle(t)) return t
  return '知识整理'
}

export async function runKnowledgeAnswerChain(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: KnowledgeAnswerInput,
  onStatus?: (text: string) => void
): Promise<string> {
  const statusLabel = pluginActivityLabel('knowledge_answer')
  onStatus?.(statusLabel)
  webContents.send('chat:status', statusLabel)

  const out = await synthesizeKnowledgeAnswer(settings, contextMessages, input)
  webContents.send('chat:searchCard', toKnowledgeCardPayload(input.topic, out))
  return out.companionReply
}
