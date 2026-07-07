import type { DesktopAgentAction } from './desktopAgent'

/** 鍗曟楠屾敹瑙勫垯锛堟枃浠剁郴缁?+ 瀹¤鏃ュ織锛?*/
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

/** 澶氭楠や换鍔¤鍒?鈥?Agent 闂幆鐘舵€佹満 */
export type DesktopAgentTaskPlan = {
  id: string
  sourceText: string
  /** LLM 褰掔撼鐨勭敤鎴风洰鏍囷紙灞曠ず鐢級 */
  goalSummary: string
  steps: TaskPlanStep[]
  createdAt: string
  /** 瑙勫垝鏉ユ簮 */
  planner: 'llm' | 'regex'
}

export type TaskPlanProgress = {
  plan: DesktopAgentTaskPlan
  completedStepIds: string[]
  pendingSteps: TaskPlanStep[]
  failedSteps: TaskPlanStep[]
  allPassed: boolean
}

/** UI / IPC 杩涘害锛堝鏍?Investigation 杩涘害鏉★級 */
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
  /寤簗鍐檤鍒涘缓|鍐欏叆|鏂板缓|鎵撳紑|鍒爘鍒犻櫎|绉婚櫎|澶嶅埗|绉诲姩|涓嬭浇|瀵煎叆|鏁寸悊|娓呯悊|鍒楀嚭|鎼滅储|璇诲彇|鐪嬬湅/u

export function isMultiStepDesktopAgentTask(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/(鐒跺悗|鍐峾鏈€鍚巪鎺ョ潃|锛屽苟|閲岄潰|涔嬪悗|骞朵笖)/u.test(t)) return true
  const verbs = t.match(/寤簗鍐檤鎵撳紑|鍒爘鍒涘缓|鍐欏叆|鏂板缓|鍒犻櫎|澶嶅埗|绉诲姩/gu)
  return (verbs?.length ?? 0) >= 2
}

/** 鏄惁鍍忋€岃鍦ㄧ數鑴戜笂鍔ㄦ墜銆嶇殑浠诲姟锛堝€煎緱璧?TaskPlan锛?*/
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
  'import_to_Ackem',
  'download_file'
]
