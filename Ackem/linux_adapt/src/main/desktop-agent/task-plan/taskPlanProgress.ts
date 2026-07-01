import type { WebContents } from 'electron'
import type {
  DesktopAgentTaskPlan,
  TaskPlanPhase,
  TaskPlanProgressPayload,
  TaskPlanStepStatus
} from '../../../shared/desktopAgentTaskPlan'
import type { TaskPlanProgress } from '../../../shared/desktopAgentTaskPlan'
import { evaluateTaskPlanProgress } from './verifyTaskPlan'
import type { DesktopAgentAuditEntry } from '../../../shared/desktopAgent'

function stepStatuses(
  plan: DesktopAgentTaskPlan,
  progress: TaskPlanProgress,
  currentStepId?: string
): Array<{ id: string; label: string; status: TaskPlanStepStatus }> {
  return plan.steps.map((s) => {
    if (progress.completedStepIds.includes(s.id)) {
      return { id: s.id, label: s.label, status: 'passed' as const }
    }
    if (currentStepId === s.id) {
      return { id: s.id, label: s.label, status: 'running' as const }
    }
    return { id: s.id, label: s.label, status: 'pending' as const }
  })
}

function progressLabel(
  phase: TaskPlanPhase,
  done: number,
  total: number,
  goalSummary: string
): string {
  if (phase === 'planning') return '电脑助手 · 制定任务计划…'
  if (phase === 'delivering') return '电脑助手 · 验收通过，整理回复…'
  if (phase === 'incomplete') return `电脑助手 · 任务未完成（${done}/${total}）`
  if (phase === 'done') return '电脑助手 · 任务结束'
  return `电脑助手 · 执行与自检 ${done}/${total} · ${goalSummary.slice(0, 40)}`
}

export function buildTaskPlanProgressPayload(
  plan: DesktopAgentTaskPlan | null,
  phase: TaskPlanPhase,
  progress?: TaskPlanProgress | null,
  currentStepId?: string,
  statusHint?: string
): TaskPlanProgressPayload | null {
  if (!plan && phase === 'planning' && statusHint) {
    return {
      phase,
      goalSummary: statusHint,
      done: 0,
      total: 0,
      label: progressLabel('planning', 0, 0, statusHint),
      steps: []
    }
  }
  if (!plan) return null

  const prog =
    progress ??
    ({
      plan,
      completedStepIds: [],
      pendingSteps: plan.steps,
      failedSteps: [],
      allPassed: false
    } satisfies TaskPlanProgress)

  const done = prog.completedStepIds.length
  const total = plan.steps.length
  const nextId = currentStepId ?? prog.pendingSteps[0]?.id

  return {
    phase,
    goalSummary: plan.goalSummary,
    done,
    total,
    label: statusHint ?? progressLabel(phase, done, total, plan.goalSummary),
    currentStepId: nextId,
    steps: stepStatuses(plan, prog, nextId)
  }
}

export function emitTaskPlanProgress(
  webContents: WebContents | undefined,
  plan: DesktopAgentTaskPlan | null,
  phase: TaskPlanPhase,
  statusHint?: string,
  audit?: DesktopAgentAuditEntry[],
  currentStepId?: string
): void {
  if (!webContents) return
  const progress = plan && audit ? evaluateTaskPlanProgress(plan, audit) : null
  const payload = buildTaskPlanProgressPayload(plan, phase, progress, currentStepId, statusHint)
  if (payload) {
    webContents.send('chat:status', payload.label)
    webContents.send('taskplan:progress', payload)
  } else if (phase === 'done') {
    webContents.send('taskplan:progress', null)
  }
}

export function emitTaskPlanFromAudit(
  webContents: WebContents | undefined,
  plan: DesktopAgentTaskPlan,
  audit: DesktopAgentAuditEntry[],
  phase: TaskPlanPhase = 'executing'
): TaskPlanProgress {
  const progress = evaluateTaskPlanProgress(plan, audit)
  emitTaskPlanProgress(webContents, plan, progress.allPassed ? 'verifying' : phase, undefined, audit)
  return progress
}

export function clearTaskPlanProgress(webContents: WebContents | undefined): void {
  if (!webContents) return
  webContents.send('taskplan:progress', null)
}
