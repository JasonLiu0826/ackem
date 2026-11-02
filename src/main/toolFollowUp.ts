import { openAiOutputTokenParams } from '../shared/outputTokens'
// [toolFollowUp] — 工具执行后的第二轮 LLM 请求体
// 不用 assistant+tool_calls 协议，避免 DeepSeek 等 thinking 模型要求回传 reasoning_content 导致 400

import type { AppSettings } from './settings'
import { buildSelectedPersonalityVoice, personalityToolFallbackLead } from './personalityVoice'
import type { UserTaskFrame } from '../shared/taskFrame'
import { buildToolFollowUpFormatBlock } from './taskFrame/formatInstructions'
import { flattenMessageContent } from './chat/messageContent'

export type ToolResultForFollowUp = { name: string; content: string }

function messageText(content: unknown): string {
  return flattenMessageContent(content)
}

const TOOL_LABEL: Record<string, string> = {
  web_search: '网页搜索',
  read_file: '文件读取',
}

/** 构建 follow-up 消息：系统 + 原用户问题 + 工具结果（user 角色），兼容 thinking / 非标准 tool API */
export function buildToolFollowUpMessages(
  allMsgs: Array<{ role: string; content: unknown }>,
  toolResults: ToolResultForFollowUp[],
  taskFrame?: UserTaskFrame,
  settings?: AppSettings
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const followUp: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  const sysMsg = allMsgs.find(m => m.role === 'system')
  if (sysMsg) {
    followUp.push({ role: 'system', content: messageText(sysMsg.content) })
  }

  if (settings) {
    const voice = buildSelectedPersonalityVoice(settings)
    if (followUp[0]?.role === 'system') followUp[0].content += `\n\n${voice}`
    else followUp.push({ role: 'system', content: voice })
  }

  const lastUser = [...allMsgs].reverse().find(m => m.role === 'user')
  if (lastUser) {
    followUp.push({ role: 'user', content: messageText(lastUser.content) })
  }

  const blocks = toolResults
    .filter(tr => tr.name !== 'append_memory')
    .map(tr => {
      const label = TOOL_LABEL[tr.name] ?? tr.name
      return `【${label}结果】\n${tr.content}`
    })
    .join('\n\n')

  if (blocks) {
    followUp.push({
      role: 'user',
      content:
        `${blocks}\n\n` +
        '【任务】请直接回答用户上一句的问题。\n' +
        buildToolFollowUpFormatBlock(taskFrame) + '\n' +
        '- 以搜索结果为主，若摘要偏泛可结合常识简要补充，但仍要给出实质内容；\n' +
        '- 禁止说「要不要再搜」「换个关键词」「你主要关注哪一块」等推脱话；\n' +
        '- 不要复述本段说明。'
    })
  }

  return followUp
}

/** 使用用户 settings 中的 model / 端点（与首轮一致），且不附带 tools */
/** 工具已执行但第二轮 LLM 失败时的兜底文案 */
export function buildToolResultsFallback(toolResults: ToolResultForFollowUp[], settings?: AppSettings): string {
  const lead = settings ? personalityToolFallbackLead(settings) : '工具已返回内容，但回复生成中断了。'
  const hasSearch = toolResults.some(tr => tr.name === 'web_search')
  const other = toolResults.filter(tr => tr.name !== 'append_memory' && tr.name !== 'web_search')
  if (hasSearch && other.length === 0) {
    return `${lead}\n\n${toolResults.filter(tr => tr.name === 'web_search').map(tr => tr.content).join('\n\n')}`
  }
  const parts = other.map(tr => {
    const label = TOOL_LABEL[tr.name] ?? tr.name
    return `【${label}】\n${tr.content}`
  })
  if (hasSearch) {
    parts.unshift(...toolResults.filter(tr => tr.name === 'web_search').map(tr => tr.content))
  }
  return `${lead}${parts.length ? '\n\n' + parts.join('\n\n') : ''}`
}

export function buildToolFollowUpRequestBody(
  settings: AppSettings,
  allMsgs: Array<{ role: string; content: unknown }>,
  toolResults: ToolResultForFollowUp[],
  maxTokens = 600,
  taskFrame?: UserTaskFrame,
  extraUserSuffix?: string
): Record<string, unknown> {
  const messages = buildToolFollowUpMessages(allMsgs, toolResults, taskFrame, settings)
  if (extraUserSuffix?.trim()) {
    const last = messages[messages.length - 1]
    if (last?.role === 'user') {
      last.content = `${last.content}\n\n${extraUserSuffix.trim()}`
    } else {
      messages.push({ role: 'user', content: extraUserSuffix.trim() })
    }
  }
  return {
    model: settings.model,
    messages,
    stream: true,
    ...openAiOutputTokenParams(settings)
  }
}
