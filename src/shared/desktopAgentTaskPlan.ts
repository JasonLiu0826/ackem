import type { DesktopAgentAction } from './desktopAgent'
export type { DesktopAgentAction } from './desktopAgent'

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

/** 真要动手的祈使动词（注意：单个「写」「建」不再单独成立） */
const ACTION_VERBS =
  /(创建|新建|建|写入|写到|写个|写成|写|打开|启动|运行|关掉|关闭|删除|删|移除|复制|移动|重命名|下载|导入|整理|清理|列出|搜索|查找|读取|看看|帮我看看|扫描)/u

/** 电脑上的可操作对象 / 本机路径 / 常见扩展名 */
const COMPUTER_OBJECT =
  /(文件|文件夹|目录|桌面|文稿|下载|图片|照片|截图|文档|表格|压缩包|安装包|路径|应用|程序|浏览器|终端|命令|脚本|\/Users\/|~\/|\.(?:txt|md|pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|zip|rar|7z|mp3|wav|mp4|mov|json|csv|py|ts|tsx|js|log)\b)/iu

/** 句尾疑问 + 没有委托语气：多半是在问，不是让动手 */
const QUESTION_ONLY = /(吗|呢|\?|？)\s*$/u
const REQUEST_TONE = /(帮我|帮忙|给我|替我|麻烦|劳烦|请)/u

/**
 * 占位 / 情绪 / 寒暄：永远不算任务。
 * 修复前「[他发来一条语音，你听不到里面的内容]」因为含「里面」被当成多步任务，
 * 于是正常聊天突然回一句「已在下方电脑助手面板开始执行」。
 */
const NON_TASK =
  /^\s*\[.*\]\s*$|发来一条|听不到|看不到|\[图|\[表情|\[语音|\[长语音|晚安|早安|哈哈|在吗|想你|抱抱|么么/u

export function isMultiStepDesktopAgentTask(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t || t.length > 200) return false
  if (NON_TASK.test(t)) return false
  // 连接词本身不是任务证据：必须先出现「电脑对象」
  if (!COMPUTER_OBJECT.test(t)) return false
  const verbs =
    t.match(/创建|新建|写入|打开|删除|复制|移动|重命名|下载|整理|清理/gu)?.length ?? 0
  if (/(然后|再|最后|接着|，并|之后|并且)/u.test(t)) return verbs >= 1
  return verbs >= 2
}

/** 是否像「要在电脑上动手」的任务（值得走 TaskPlan） */
export function isActionableDesktopAgentTask(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t || t.length > 200) return false
  if (NON_TASK.test(t)) return false
  if (QUESTION_ONLY.test(t) && !REQUEST_TONE.test(t)) return false
  if (isMultiStepDesktopAgentTask(t)) return true
  if (!ACTION_VERBS.test(t)) return false
  // 动作词必须带电脑对象：「看看」「打开」单独出现不再派工
  return COMPUTER_OBJECT.test(t)
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
