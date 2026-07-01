/** 聊天区 activity 文案（不含省略号；前端统一加跳动三点） */

import type { UserTaskFrame } from '../shared/taskFrame'
import { t } from './i18n'

const SKILL_TOOL_KEYS: Record<string, string> = {
  web_search: 'chat.status.searching',
  generate_plan: 'chat.status.plan',
  draw_markdown_table: 'chat.status.table',
  get_weather: 'chat.status.weather',
  get_local_weather: 'chat.status.weather',
}

const PLUGIN_KEYS: Record<string, string> = {
  weather: 'chat.status.weather',
  knowledge: 'chat.status.knowledge',
  knowledge_answer: 'chat.status.knowledgeAnswer',
  plan_answer: 'chat.status.planAnswer',
  search_synthesis: 'chat.status.searchBrief',
}

export function skillToolActivityLabel(toolName: string): string {
  const key = SKILL_TOOL_KEYS[toolName]
  return key ? t(key) : t('chat.status.using', { tool: toolName })
}

export function pluginActivityLabel(kind: keyof typeof PLUGIN_KEYS | string): string {
  const key = PLUGIN_KEYS[kind]
  return key ? t(key) : t('chat.status.doing', { kind })
}

/** 工具结果返回后，LLM 二次整理伴侣口吻 */
export const REPLY_SYNTHESIS_LABEL = 'chat.status.synthesis'

/** 结构化交付（表格/列表）时的进行中或 follow-up 状态文案 */
export function taskFrameFollowUpActivityLabel(taskFrame?: UserTaskFrame): string {
  if (taskFrame?.delivery === 'markdown_table') {
    return skillToolActivityLabel('draw_markdown_table')
  }
  if (taskFrame?.delivery === 'bullet_list') {
    return t('chat.status.list')
  }
  return t(REPLY_SYNTHESIS_LABEL)
}

/** 首轮 LLM 思考且不透传流式时，按 Task Frame 展示进行中状态 */
export function taskFrameWorkingActivityLabel(taskFrame?: UserTaskFrame): string | null {
  if (!taskFrame || taskFrame.delivery === 'prose') return null
  return taskFrameFollowUpActivityLabel(taskFrame)
}

export function desktopAgentActivityLabel(action: string): string {
  return t('chat.status.desktopAgent', { action })
}

export function normalizeActivityPayload(text: string): string {
  return text.trim().replace(/[…\.。]+$/u, '')
}
