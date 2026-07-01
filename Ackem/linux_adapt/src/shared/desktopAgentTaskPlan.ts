import type { DesktopAgentAction } from './desktopAgent'

/** 单步验收规则（文件系统 + 审计日志） */
export type TaskPlanVerification =
  | { type: 'path_exists'; path: string }
  | { type: 'path_absent'; path: string }
  | { type: 'is_directory'; path: string }
  | { type: 'file_min_bytes'; path: string; minBytes: number }
  | { type: 'file_contains'; path: string; substring?: string }
  | {
      type: 'audit_action'
      action: DesktopAgentAction
      path: string
      result?: 'allowed'
    }

export type TaskPlanStepStatus = 'pending' | 'running' | 'passed' | 'failed'

export type TaskPlanStep = {
  id: string
  label: string
  action: DesktopAgentAction
  path?: string
  options?: Record<string, unknown>
  verify: TaskPlanVerification[]
  status: TaskPlanStepStatus
}

export type TaskPlanPhase =
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'delivering'
  | 'incomplete'
  | 'done'

/** 多步骤任务计划 — Agent 闭环状态机 */
export type DesktopAgentTaskPlan = {
  id: string
  sourceText: string
  /** LLM 归纳的用户目标（展示用） */
  goalSummary: string
  steps: TaskPlanStep[]
  createdAt: string
  /** 规划来源 */
  planner: 'llm' | 'regex'
}

export type TaskPlanProgress = {
  plan: DesktopAgentTaskPlan
  completedStepIds: string[]
  pendingSteps: TaskPlanStep[]
  failedSteps: TaskPlanStep[]
  allPassed: boolean
}

/** UI / IPC 进度（对标 Investigation 进度条） */
export type TaskPlanProgressPayload = {
  phase: TaskPlanPhase
  goalSummary: string
  done: number
  total: number
  label: string
  currentStepId?: string
  steps: Array<{ id: string; label: string; status: TaskPlanStepStatus }>
}

const ACTION_VERBS =
  /建|写|创建|写入|新建|打开|删|删除|移除|复制|移动|下载|导入|整理|清理|列出|搜索|读取|看看/u

export function isMultiStepDesktopAgentTask(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/(然后|再|最后|接着|，并|里面|之后|并且)/u.test(t)) return true
  const verbs = t.match(/建|写|打开|删|创建|写入|新建|删除|复制|移动/gu)
  return (verbs?.length ?? 0) >= 2
}

/** 是否像「要在电脑上动手」的任务（值得走 TaskPlan） */
export function isActionableDesktopAgentTask(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (isMultiStepDesktopAgentTask(t)) return true
  return ACTION_VERBS.test(t)
}

export const DESKTOP_AGENT_TASK_ACTIONS: DesktopAgentAction[] = [
  'list_folder',
  'search_files',
  'stat_file',
  'grep_text',
  'read_text',
  'read_document',
  'open_folder',
  'open_file',
  'open_app',
  'mkdir',
  'write_text',
  'copy_path',
  'move_path',
  'delete_path',
  'import_to_ackem',
  'download_file'
]
