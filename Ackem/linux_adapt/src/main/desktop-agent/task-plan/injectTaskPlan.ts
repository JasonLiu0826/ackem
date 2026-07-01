import type { DesktopAgentTaskPlan } from '../../../shared/desktopAgentTaskPlan'
import { buildTaskPlanSystemHint } from './taskPlanPrompt'

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

/** 将 TaskPlan 注入对话 system 段（不新增 user 气泡） */
export function injectTaskPlanSystemHint(
  messages: Array<{ role: string; content: unknown }>,
  plan: DesktopAgentTaskPlan
): Array<{ role: string; content: unknown }> {
  const hint = buildTaskPlanSystemHint(plan)
  const next = messages.map((m) => ({ ...m }))
  const sysIdx = next.findIndex((m) => m.role === 'system')
  if (sysIdx >= 0) {
    next[sysIdx] = {
      role: 'system',
      content: `${messageText(next[sysIdx]!.content)}\n\n${hint}`
    }
  } else {
    next.unshift({ role: 'system', content: hint })
  }
  return next
}
