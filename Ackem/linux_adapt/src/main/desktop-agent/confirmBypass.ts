import type { DesktopAgentAction } from '../../shared/desktopAgent'

/** 即使开启「本轮全部允许」也仍需单独确认的操作 */
export const ALWAYS_CONFIRM_ACTIONS = new Set<DesktopAgentAction>([
  'close_file',
  'close_app',
  'delete_path',
  'run_installer',
  'download_and_install'
])

function sessionKey(dataRoot: string, sessionId: string): string {
  return `${dataRoot}::${sessionId}`
}

const sessionAutoApprove = new Set<string>()
/** TaskPlan 级别：本任务内 delete_path 不再逐条确认 */
const taskPlanDeleteAutoApprove = new Set<string>()

export function setDesktopAgentSessionAutoApprove(dataRoot: string, sessionId: string): void {
  sessionAutoApprove.add(sessionKey(dataRoot, sessionId))
}

export function setTaskPlanDeleteAutoApprove(taskPlanId: string): void {
  if (taskPlanId) taskPlanDeleteAutoApprove.add(taskPlanId)
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
  taskPlanId?: string
): boolean {
  if (action === 'delete_path' && taskPlanId && taskPlanDeleteAutoApprove.has(taskPlanId)) {
    return true
  }
  if (!hasDesktopAgentSessionAutoApprove(dataRoot, sessionId)) return false
  return !ALWAYS_CONFIRM_ACTIONS.has(action)
}

export function resetDesktopAgentConfirmBypassForTests(): void {
  sessionAutoApprove.clear()
  taskPlanDeleteAutoApprove.clear()
}
