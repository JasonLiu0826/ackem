import type { UserTaskFrame, TaskDeliveryFormat, TaskGoal } from '../../shared/taskFrame'

const VALID_GOALS = new Set<TaskGoal>(['casual', 'list', 'compare', 'explain', 'recommend'])
const VALID_DELIVERY = new Set<TaskDeliveryFormat>(['prose', 'markdown_table', 'bullet_list'])

/** 从 chat:start IPC body 解析 UserTaskFrame（容错） */
export function parseUserTaskFrameFromBody(body: Record<string, unknown>): UserTaskFrame | undefined {
  const raw = body.userTaskFrame
  if (!raw || typeof raw !== 'object') return undefined

  const o = raw as Record<string, unknown>
  const goal = typeof o.goal === 'string' && VALID_GOALS.has(o.goal as TaskGoal)
    ? (o.goal as TaskGoal)
    : 'casual'
  const delivery =
    typeof o.delivery === 'string' && VALID_DELIVERY.has(o.delivery as TaskDeliveryFormat)
      ? (o.delivery as TaskDeliveryFormat)
      : 'prose'

  const subjects = Array.isArray(o.subjects)
    ? o.subjects.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(Boolean)
    : []

  return {
    goal,
    delivery,
    subjects,
    needsSearch: o.needsSearch === true,
    searchQuery: typeof o.searchQuery === 'string' ? o.searchQuery.trim() || undefined : undefined,
    mergeWebSearch: o.mergeWebSearch === true,
    formatHint: typeof o.formatHint === 'string' ? o.formatHint.trim() || undefined : undefined,
    source:
      o.source === 'rules' || o.source === 'llm' || o.source === 'rules+llm'
        ? o.source
        : 'rules'
  }
}
