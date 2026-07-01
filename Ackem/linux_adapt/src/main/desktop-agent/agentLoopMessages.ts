import type { ToolResultForFollowUp } from '../toolFollowUp'

export const DESKTOP_AGENT_MAX_TOOL_ROUNDS = 16

const TOOL_LABEL: Record<string, string> = {
  use_computer: '电脑助手',
  web_search: '网页搜索',
  read_file: '文件读取'
}

/** 将一轮工具结果追加到对话，供下一轮 LLM 继续调用工具 */
export function appendDesktopAgentRoundMessages(
  base: Array<{ role: string; content: unknown }>,
  assistantPartial: string,
  toolResults: ToolResultForFollowUp[],
  options?: { taskPlanActive?: boolean; taskPlanNudge?: string | null }
): Array<{ role: string; content: string }> {
  const next: Array<{ role: string; content: string }> = base.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
  }))

  if (assistantPartial.trim()) {
    next.push({ role: 'assistant', content: assistantPartial.trim() })
  }

  const blocks = toolResults
    .filter((tr) => tr.name !== 'append_memory')
    .map((tr) => {
      const label = TOOL_LABEL[tr.name] ?? tr.name
      return `【${label}结果】\n${tr.content}`
    })
    .join('\n\n')

  if (blocks) {
    const continueHint = options?.taskPlanActive
      ? '【继续任务】以上是工具返回的真实结果。多步骤任务计划尚未全部验收通过时，必须继续调用 use_computer 完成下一步，禁止仅用文字声称已完成。'
      : '【继续任务】以上是工具返回的真实结果。若已足够回答用户最初的问题，请直接给出完整结论；' +
        '若还需查看其他目录/文件，请继续调用 use_computer 自行探索（常见游戏目录：Program Files、Program Files (x86)、' +
        '用户 Desktop、Start Menu 快捷方式等），不要重复询问用户「从哪个路径开始」或让用户逐步确认只读操作。'

    next.push({
      role: 'user',
      content: `${blocks}\n\n${continueHint}`
    })
  }

  if (options?.taskPlanNudge?.trim()) {
    next.push({ role: 'user', content: options.taskPlanNudge.trim() })
  }

  return next
}
