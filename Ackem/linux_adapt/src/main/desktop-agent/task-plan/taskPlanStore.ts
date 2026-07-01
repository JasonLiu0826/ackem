import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DesktopAgentTaskPlan, TaskPlanProgress } from '../../../shared/desktopAgentTaskPlan'
import { evaluateTaskPlanProgress } from './verifyTaskPlan'
import { readAuditEntriesSince } from '../auditLog'

export type PersistedTaskPlanState = {
  sessionId: string
  plan: DesktopAgentTaskPlan
  /** 上次保存时的验收快照 */
  completedStepIds: string[]
  allPassed: boolean
  updatedAt: string
  status: 'active' | 'completed'
}

function storePath(dataRoot: string, sessionId: string): string {
  return join(dataRoot, 'desktop-agent', 'task-plans', `${sessionId}.json`)
}

export function loadPersistedTaskPlan(
  dataRoot: string,
  sessionId: string
): PersistedTaskPlanState | null {
  const path = storePath(dataRoot, sessionId)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as PersistedTaskPlanState
    if (raw.sessionId !== sessionId || !raw.plan?.steps?.length) return null
    if (raw.status !== 'active') return null
    return raw
  } catch {
    return null
  }
}

export function savePersistedTaskPlan(
  dataRoot: string,
  sessionId: string,
  plan: DesktopAgentTaskPlan,
  progress: TaskPlanProgress
): void {
  const path = storePath(dataRoot, sessionId)
  mkdirSync(dirname(path), { recursive: true })
  const state: PersistedTaskPlanState = {
    sessionId,
    plan,
    completedStepIds: progress.completedStepIds,
    allPassed: progress.allPassed,
    updatedAt: new Date().toISOString(),
    status: progress.allPassed ? 'completed' : 'active'
  }
  writeFileSync(path, JSON.stringify(state, null, 0), 'utf-8')
}

export function clearPersistedTaskPlan(dataRoot: string, sessionId: string): void {
  const path = storePath(dataRoot, sessionId)
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
  }
}

/** 跨轮验收：从计划创建时间起读 audit（含上一轮已执行的 read/open） */
export function readTaskPlanAudit(dataRoot: string, plan: DesktopAgentTaskPlan) {
  return readAuditEntriesSince(dataRoot, plan.createdAt)
}

export function evaluatePersistedProgress(
  dataRoot: string,
  plan: DesktopAgentTaskPlan
): TaskPlanProgress {
  return evaluateTaskPlanProgress(plan, readTaskPlanAudit(dataRoot, plan))
}

const CONTINUE_RE =
  /^(继续|接着|接着做|接着来|完成剩余|做完|把.+做完|继续上次|继续刚才|未完成|剩下的|下一步)/u

export function isContinueTaskPlanIntent(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (CONTINUE_RE.test(t)) return true
  return /继续.*(任务|步骤|执行|删除|完成)/u.test(t)
}

export function buildContinueTaskPlanHint(state: PersistedTaskPlanState, progress: TaskPlanProgress): string {
  const pending = progress.pendingSteps.map((s) => s.label).join('；')
  return [
    '【续做上次未完成的电脑助手任务】',
    `目标：${state.plan.goalSummary}`,
    `已完成 ${progress.completedStepIds.length}/${state.plan.steps.length} 步。`,
    pending ? `待完成：${pending}` : '',
    '请从下一步继续调用 use_computer，直至全部验收通过。'
  ]
    .filter(Boolean)
    .join('\n')
}
