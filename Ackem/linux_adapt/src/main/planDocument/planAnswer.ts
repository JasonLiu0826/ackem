// [planDocument/planAnswer] — 计划书 Markdown 正文 + 伴侣短评

import type { WebContents } from 'electron'
import type { AppSettings } from '../settings'
import { createLlmJsonClient } from '../llmClient'
import type { SearchCardPayload } from '../../shared/searchCard'
import { recencyPromptSuffix } from '../extensions/plugins/builtin/knowledge-presentation/presentation/recencyContext'
import { lastUserMessageFromContext } from '../extensions/plugins/builtin/knowledge-presentation/knowledgeAnswer'
import {
  buildPaperCardCompanionUserTail,
  defaultPaperCardCompanionFallback,
  PAPER_CARD_COMPANION_SYSTEM_SUFFIX
} from '../paperCardCompanionPrompt'
import { finalizePaperCardCompanionReply } from '../paperCard/finalizeCompanionReply'
import { resolvePaperCardDisplayTitle } from '../paperCard/resolveDisplayTitle'
import { runPlanDocumentViaSkill } from '../extensions/skills/builtin/tool/plan-document/skillBridge'

export type PlanAnswerInput = {
  topic: string
  userQuestion: string
}

export type PlanAnswerOutput = {
  cardBody: string
  companionReply: string
  copyText: string
  displayTitle: string
}

const CARD_BODY_MAX_TOKENS = 3600

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function extractSystemFromMessages(
  messages: Array<{ role: string; content: unknown }>
): string {
  const sys = messages.find(m => m.role === 'system')
  return sys ? messageText(sys.content) : ''
}

const PLAN_DOCUMENT_INSTRUCTIONS = `请撰写「计划书正文」——一份可保存、可执行的 Markdown 计划，直接回应用户需求。

结构与篇幅（**硬性，缺一即失败**）：
- 全文 **至少 400 字**；必须使用 Markdown（## / ### / 列表 / 可选表格）
- **必须**包含以下章节（按顺序，标题用 ##）：
  1. **目标与背景** — 2～4 句，说清要达成什么
  2. **总体安排** — 时间线或阶段划分（可用表格或有序列表）
  3. **分步任务** — ≥5 条可执行项（checkbox 格式 \`- [ ] 任务\` 优先）
  4. **资源与准备** — 人/物/信息需要什么
  5. **风险与备选** — ≥2 条
  6. **下一步** — 立刻能做的 1～3 件事

写作要求：
- 以可操作为主，少空话；不确定处标注「待你确认」
- **禁止**只有开场白或态度宣言就结束
- **禁止**推脱式追问；**禁止**「想聊再找我」式闲聊邀请
- 不要编造具体实时票价/天气；可写「建议出发前查询」
- 文首可用一行 \`# 计划：{主题}\` 作总标题`

const PLAN_RETRY_INSTRUCTIONS = `【补写】上一轮过短或缺章节。请重写完整计划书 Markdown（≥400 字、≥5 个 ## 章节、≥5 条 checkbox 任务）。`

function isPlanBodyInsufficient(body: string): boolean {
  const t = body.trim()
  const headings = (t.match(/^#{1,3}\s+/gm) ?? []).length
  const checkboxes = (t.match(/^[\s]*-\s*\[[ xX]\]/gm) ?? []).length
  if (t.length >= 380 && headings >= 4 && checkboxes >= 3) return false
  if (t.length < 200) return true
  if (headings < 3) return true
  if (checkboxes < 2 && !/^[\s]*\d+[.)．、]/m.test(t)) return true
  return false
}

async function llmText(
  settings: AppSettings,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const client = createLlmJsonClient(settings)
  return (
    await client.chatCompletionJsonDetailed({
      messages,
      temperature,
      max_tokens: maxTokens
    })
  ).text.trim()
}

async function synthesizePlanCardBody(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  topic: string
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        '\n\n【当前任务】撰写计划书 Markdown 正文。信息完整与结构优先于伴侣口吻；不要调用工具。'
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `【计划书任务】主题：「${topic}」\n${recencyPromptSuffix()}\n\n` +
        PLAN_DOCUMENT_INSTRUCTIONS
    }
  ]
  let text = await llmText(settings, messages, CARD_BODY_MAX_TOKENS, 0.45)

  if (isPlanBodyInsufficient(text)) {
    messages.push({ role: 'assistant', content: text })
    messages.push({ role: 'user', content: PLAN_RETRY_INSTRUCTIONS })
    const retry = await llmText(settings, messages, CARD_BODY_MAX_TOKENS, 0.38)
    if (retry && retry.length > text.length) text = retry
  }

  return text || '（未能生成计划书正文，请稍后重试。）'
}

async function synthesizePlanCompanionReply(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  topic: string,
  cardBody: string
): Promise<string> {
  const excerpt = cardBody.length > 400 ? `${cardBody.slice(0, 400)}…` : cardBody
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        PAPER_CARD_COMPANION_SYSTEM_SUFFIX +
        '\n\n【当前任务】计划书已在纸面卡。用伴侣口吻 **1～2 句话**（≤80 字）接话或点一个起步动作，**禁止复述**计划条目。'
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `【背景】你刚帮用户写好「${topic}」的计划书（见上方纸面卡）。\n（勿复述条目）\n${excerpt}` +
        buildPaperCardCompanionUserTail('计划书', topic)
    }
  ]
  const text = await llmText(settings, messages, 320, 0.85)
  const trimmed = text.trim()
  if (!trimmed) return defaultPaperCardCompanionFallback('计划书')
  return finalizePaperCardCompanionReply(trimmed)
}

export function buildPlanCopyText(displayTitle: string, cardBody: string): string {
  return `【计划书】${displayTitle}\n${'─'.repeat(32)}\n${cardBody.trim()}`
}

export async function synthesizePlanDocument(
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: PlanAnswerInput
): Promise<PlanAnswerOutput> {
  const systemContext = extractSystemFromMessages(contextMessages)
  const userQuestion = input.userQuestion.trim() || input.topic

  const cardBody = await synthesizePlanCardBody(
    settings,
    systemContext,
    userQuestion,
    input.topic
  )
  const displayTitle = await resolvePaperCardDisplayTitle(
    settings,
    'plan',
    userQuestion,
    input.topic,
    cardBody
  )
  const companionReply = await synthesizePlanCompanionReply(
    settings,
    systemContext,
    userQuestion,
    displayTitle,
    cardBody
  )

  return {
    cardBody,
    companionReply,
    copyText: buildPlanCopyText(displayTitle, cardBody),
    displayTitle
  }
}

export function toPlanCardPayload(topic: string, out: PlanAnswerOutput): SearchCardPayload {
  return {
    query: topic,
    displayTitle: out.displayTitle,
    cardBody: out.cardBody,
    sources: [],
    copyText: out.copyText,
    mode: 'plan'
  }
}

export async function runPlanAnswerChain(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: PlanAnswerInput,
  onStatus?: (text: string) => void
): Promise<string> {
  return runPlanDocumentViaSkill(webContents, settings, contextMessages, input, onStatus)
}

export { lastUserMessageFromContext }
