/**
 * D-07 — todo + background agent chrome line (CC 药丸 spirit).
 */
import { l } from './language.js'

export type TodoPill = { content: string; status: string; activeForm: string }

export type BgAgentPill = {
  agentId: string
  description: string
  subagentType: string
  status: string
}

export function formatChromePills(
  todos: TodoPill[],
  bgAgents: BgAgentPill[],
  maxWidth = 72
): string | null {
  const parts: string[] = []

  const open = todos.filter((t) => t.status !== 'completed')
  if (open.length) {
    const active = todos.find((t) => t.status === 'in_progress')
    const done = todos.filter((t) => t.status === 'completed').length
    const label = active
      ? active.activeForm || active.content
      : open[0]!.content
    parts.push(`${l('任务', 'todo')} ${done}/${todos.length} · ${label.slice(0, 28)}`)
  }

  const running = bgAgents.filter((a) => a.status === 'running')
  if (running.length) {
    const head = running[0]!
    parts.push(
      `${l('后台', 'bg')} ${running.length} · ${head.subagentType} · ${head.description.slice(0, 24)}`
    )
  } else {
    const recent = bgAgents.find((a) => a.status === 'completed' || a.status === 'failed')
    if (recent && bgAgents.length) {
      const status =
        recent.status === 'completed'
          ? l('已完成', 'completed')
          : recent.status === 'failed'
            ? l('失败', 'failed')
            : recent.status
      parts.push(`${l('后台', 'bg')} ${status} · ${recent.description.slice(0, 20)}`)
    }
  }

  if (!parts.length) return null
  const line = parts.join('   ')
  return line.length > maxWidth ? `${line.slice(0, maxWidth - 1)}…` : line
}
