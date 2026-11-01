import type { DesktopAgentAction } from '../../shared/desktopAgent'

/** 即使开启「本轮全部允许」也仍需单独确认的操作（含全部写入/启动类动作） */
export const ALWAYS_CONFIRM_ACTIONS = new Set<DesktopAgentAction>([
  'close_file',
  'close_app',
  'delete_path',
  'run_installer',
  'download_and_install',
  'write_text',
  'copy_path',
  'move_path',
  'mkdir',
  'download_file',
  'open_app',
  'import_to_ackem'
])

function sessionKey(dataRoot: string, sessionId: string): string {
  return `${dataRoot}::${sessionId}`
}

const sessionAutoApprove = new Set<string>()
/** TaskPlan 级别：本任务内 delete_path 仅对已确认展示过的路径放行（前缀匹配） */
const taskPlanDeleteAutoApprove = new Map<string, Set<string>>()

export function setDesktopAgentSessionAutoApprove(dataRoot: string, sessionId: string): void {
  sessionAutoApprove.add(sessionKey(dataRoot, sessionId))
}

export function setTaskPlanDeleteAutoApprove(taskPlanId: string, paths?: string[]): void {
  if (!taskPlanId) return
  const existing = taskPlanDeleteAutoApprove.get(taskPlanId) ?? new Set<string>()
  for (const p of paths ?? []) {
    if (p) existing.add(p)
  }
  taskPlanDeleteAutoApprove.set(taskPlanId, existing)
}

export function clearTaskPlanDeleteAutoApprove(taskPlanId?: string): void {
  if (!taskPlanId) {
    taskPlanDeleteAutoApprove.clear()
    return
  }
  taskPlanDeleteAutoApprove.delete(taskPlanId)
}

export function clearDesktopAgentSessionAutoApprove(dataRoot: string, sessionId?: string): void {
  if (!sessionId) {
    for (const key of [...sessionAutoApprove]) {
      if (key.startsWith(`${dataRoot}::`)) sessionAutoApprove.delete(key)
    }
    return
  }
  sessionAutoApprove.delete(sessionKey(dataRoot, sessionId))
}

export function hasDesktopAgentSessionAutoApprove(dataRoot: string, sessionId: string): boolean {
  return sessionAutoApprove.has(sessionKey(dataRoot, sessionId))
}

export function shouldSkipDesktopAgentConfirm(
  dataRoot: string,
  sessionId: string,
  action: DesktopAgentAction,
  taskPlanId?: string,
  path?: string
): boolean {
  if (action === 'delete_path' && taskPlanId && path) {
    const approved = taskPlanDeleteAutoApprove.get(taskPlanId)
    if (approved && approved.size > 0) {
      const hit = [...approved].some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '\\'))
      if (hit) return true
    }
    // 未放行路径：不跳过（宁可多确认一次）
    return false
  }
  if (!hasDesktopAgentSessionAutoApprove(dataRoot, sessionId)) return false
  return !ALWAYS_CONFIRM_ACTIONS.has(action)
}

export function resetDesktopAgentConfirmBypassForTests(): void {
  sessionAutoApprove.clear()
  taskPlanDeleteAutoApprove.clear()
}
