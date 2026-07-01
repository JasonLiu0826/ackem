// [taskFrame/resolveUserTaskFrame] — L0 任务框：规则 + 轻量 LLM（无实体词表）

import type { AppSettings } from '../settings'
import { createLlmJsonClient } from '../llmClient'
import { parseJsonObject } from '../extensions/plugins/builtin/knowledge-presentation/presentation/searchQueryResolver'
import {
  buildFormatHintFromDelivery,
  detectTaskFrameRules,
  taskFrameFromRules,
  type TaskDeliveryFormat,
  type TaskGoal,
  type UserTaskFrame
} from '../../shared/taskFrame'
import type { TurnPlan } from '../../shared/turnPlan'
import { shouldForceTaskFrameLlmEnrich, turnPlanToUserTaskFrame } from '../../shared/turnPlan'

const RESOLVE_MAX_TOKENS = 320

type LlmTaskFrameJson = {
  goal?: string
  delivery?: string
  subjects?: string[]
  needs_search?: boolean
  search_query?: string
  format_hint?: string
}

const VALID_GOALS = new Set<TaskGoal>(['casual', 'list', 'compare', 'explain', 'recommend'])
const VALID_DELIVERY = new Set<TaskDeliveryFormat>(['prose', 'markdown_table', 'bullet_list'])

function normalizeGoal(raw: string | undefined, fallback: TaskGoal): TaskGoal {
  const g = (raw ?? '').trim() as TaskGoal
  return VALID_GOALS.has(g) ? g : fallback
}

function normalizeDelivery(raw: string | undefined, fallback: TaskDeliveryFormat): TaskDeliveryFormat {
  const d = (raw ?? '').trim() as TaskDeliveryFormat
  return VALID_DELIVERY.has(d) ? d : fallback
}

function normalizeSubjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(s => s.length >= 1 && s.length <= 40)
    .slice(0, 6)
}

function mergeFrames(rules: UserTaskFrame, llm: Partial<UserTaskFrame>): UserTaskFrame {
  const delivery = llm.delivery && llm.delivery !== 'prose' ? llm.delivery : rules.delivery
  const goal = llm.goal && llm.goal !== 'casual' ? llm.goal : rules.goal
  const subjects = llm.subjects && llm.subjects.length > 0 ? llm.subjects : rules.subjects
  const mergeWebSearch =
    rules.mergeWebSearch ||
    goal === 'compare' ||
    (subjects.length >= 2 && (delivery === 'markdown_table' || goal === 'list'))

  const searchQuery = llm.searchQuery?.trim() || rules.searchQuery
  const formatHint =
    llm.formatHint?.trim() ||
    rules.formatHint ||
    buildFormatHintFromDelivery(delivery, goal)

  return {
    goal,
    delivery,
    subjects,
    needsSearch: llm.needsSearch ?? rules.needsSearch,
    searchQuery: searchQuery || undefined,
    mergeWebSearch,
    formatHint,
    source: 'rules+llm'
  }
}

async function enrichTaskFrameWithLlm(
  settings: AppSettings,
  userMessage: string,
  rulesFrame: UserTaskFrame
): Promise<UserTaskFrame> {
  const ruleHint = detectTaskFrameRules(userMessage)
  const client = createLlmJsonClient(settings)

  const raw = await client.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content:
          '你是用户任务解析器。根据用户原话判断：信息目标、交付形态、涉及对象、是否需要联网搜索。\n' +
          '要求：\n' +
          '- subjects 仅从用户原话抽取，勿编造\n' +
          '- 用户说「列个表/表格/对比」时 delivery 必须为 markdown_table\n' +
          '- 用户说「列出来/分条」时 delivery 为 bullet_list\n' +
          '- 对比/多对象列表时 search_query 须为**一条合并查询**（勿拆成多次搜索）\n' +
          '- needs_search：时效性地点/新闻/价格/版本等需联网；纯常识闲聊为 false\n' +
          '- 仅输出 JSON：{"goal":"list|compare|explain|recommend|casual","delivery":"prose|markdown_table|bullet_list","subjects":[],"needs_search":true,"search_query":"...","format_hint":"..."}'
      },
      {
        role: 'user',
        content:
          `用户原话：\n${userMessage}\n\n` +
          `规则层初判：goal=${ruleHint.goal} delivery=${ruleHint.delivery} merge=${ruleHint.mergeWebSearch}`
      }
    ],
    temperature: 0.12,
    max_tokens: RESOLVE_MAX_TOKENS
  })

  const parsed = parseJsonObject<LlmTaskFrameJson>(raw)
  if (!parsed) return rulesFrame

  const llmPartial: Partial<UserTaskFrame> = {
    goal: normalizeGoal(parsed.goal, rulesFrame.goal),
    delivery: normalizeDelivery(parsed.delivery, rulesFrame.delivery),
    subjects: normalizeSubjects(parsed.subjects),
    needsSearch: parsed.needs_search === true,
    searchQuery: parsed.search_query?.trim(),
    formatHint: parsed.format_hint?.trim()
  }

  return mergeFrames(rulesFrame, llmPartial)
}

/**
 * 解析用户任务框（L0）。
 * 规则层同步；仅在需要时调用 LLM  enrich（结构化交付 / 对比 / 列表 / 显式搜索）。
 */
export async function resolveUserTaskFrame(
  settings: AppSettings,
  userMessage: string,
  turnPlan?: TurnPlan
): Promise<UserTaskFrame> {
  const trimmed = userMessage.trim()
  if (!trimmed) return taskFrameFromRules('')

  if (turnPlan) {
    return turnPlanToUserTaskFrame(turnPlan)
  }

  const rulesFrame = taskFrameFromRules(trimmed)
  const hint = detectTaskFrameRules(trimmed)

  if (!hint.needsLlmEnrich && !shouldForceTaskFrameLlmEnrich(trimmed)) {
    return rulesFrame
  }

  try {
    return await enrichTaskFrameWithLlm(settings, trimmed, rulesFrame)
  } catch {
    return rulesFrame
  }
}
