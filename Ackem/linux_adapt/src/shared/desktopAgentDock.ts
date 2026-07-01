import type { DesktopAgentConfirmRequest } from './desktopAgent'
import type { TaskPlanProgressPayload } from './desktopAgentTaskPlan'

/** 后台电脑助手任务启动后，聊天区占位回复 */
export const DESKTOP_AGENT_TASK_START_ACK =
  '好的，已在下方电脑助手面板开始执行。需要确认的操作也会显示在那里，你可以继续和我聊天。'

export type DesktopAgentJobPhase =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'waiting_confirm'
  | 'delivering'
  | 'completed'
  | 'incomplete'
  | 'failed'

export type DesktopAgentJobStatePayload = {
  sessionId: string
  phase: DesktopAgentJobPhase
  label?: string
  /** 是否有后台任务占用本 session */
  active: boolean
}

export type DesktopAgentTaskDeliveryPayload = {
  sessionId: string
  taskPlanId?: string
  goalSummary: string
  allPassed: boolean
  text: string
  /** 若聊天正在流式输出，则为 true */
  queued: boolean
}

export type DesktopAgentDockSnapshot = {
  job: DesktopAgentJobStatePayload | null
  progress: TaskPlanProgressPayload | null
  confirm: DesktopAgentConfirmRequest | null
  pendingDelivery: DesktopAgentTaskDeliveryPayload | null
}
