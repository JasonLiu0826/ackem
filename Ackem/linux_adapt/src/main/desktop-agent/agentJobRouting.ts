import { isActionableDesktopAgentTask } from '../../shared/desktopAgentTaskPlan'
import { DESKTOP_AGENT_TASK_START_ACK } from '../../shared/desktopAgentDock'
import { isContinueTaskPlanIntent, loadPersistedTaskPlan } from './task-plan/taskPlanStore'

export { DESKTOP_AGENT_TASK_START_ACK }

export function shouldRouteDesktopAgentToBackgroundJob(
  userText: string,
  dataRoot: string,
  sessionId: string
): boolean {
  const text = userText.trim()
  if (!text) return false
  if (isContinueTaskPlanIntent(text)) {
    const persisted = loadPersistedTaskPlan(dataRoot, sessionId)
    return persisted != null && !persisted.allPassed
  }
  return isActionableDesktopAgentTask(text)
}
