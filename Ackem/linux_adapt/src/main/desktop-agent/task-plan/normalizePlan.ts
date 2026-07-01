import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import type {
  DesktopAgentAction,
  DesktopAgentTaskPlan,
  TaskPlanStep,
  TaskPlanVerification
} from '../../../shared/desktopAgentTaskPlan'
import { DESKTOP_AGENT_TASK_ACTIONS } from '../../../shared/desktopAgentTaskPlan'

const ALLOWED = new Set<DesktopAgentAction>(DESKTOP_AGENT_TASK_ACTIONS)

export function expandPlanPath(raw: string, desktopPath: string): string {
  let s = raw.trim()
  s = s.replace(/\$\{DESKTOP\}/gi, desktopPath)
  s = s.replace(/\{DESKTOP\}/gi, desktopPath)
  s = s.replace(/^~(?=$|[\\/])/u, homedir())
  if (/^桌面[\\/]/u.test(s)) {
    s = join(desktopPath, s.replace(/^桌面[\\/]/u, ''))
  }
  if (!isAbsolute(s)) {
    s = join(desktopPath, s)
  }
  return normalize(s)
}

function defaultVerifyForStep(step: Pick<TaskPlanStep, 'action' | 'path'>): TaskPlanVerification[] {
  const p = step.path
  if (!p) return []

  switch (step.action) {
    case 'mkdir':
      return [
        { type: 'path_exists', path: p },
        { type: 'is_directory', path: p }
      ]
    case 'write_text':
      return [
        { type: 'path_exists', path: p },
        { type: 'file_min_bytes', path: p, minBytes: 1 }
      ]
    case 'read_text':
      return [
        {
          type: 'audit_action',
          action: 'read_text',
          path: p,
          result: 'allowed'
        },
        {
          type: 'audit_action',
          action: 'open_file',
          path: p,
          result: 'allowed'
        }
      ]
    case 'open_file':
    case 'open_folder':
      return [
        {
          type: 'audit_action',
          action: step.action,
          path: p,
          result: 'allowed'
        }
      ]
    case 'delete_path':
      return [{ type: 'path_absent', path: p }]
    case 'list_folder':
    case 'search_files':
    case 'stat_file':
      return [
        {
          type: 'audit_action',
          action: step.action,
          path: p,
          result: 'allowed'
        }
      ]
    default:
      return [
        {
          type: 'audit_action',
          action: step.action,
          path: p,
          result: 'allowed'
        }
      ]
  }
}

export type RawLlmPlanStep = {
  id?: string
  label?: string
  action?: string
  path?: string
  options?: Record<string, unknown>
}

export type RawLlmPlan = {
  goalSummary?: string
  steps?: RawLlmPlanStep[]
}

export function normalizeLlmTaskPlan(
  raw: RawLlmPlan,
  sourceText: string,
  planId: string,
  desktopPath: string
): DesktopAgentTaskPlan | null {
  const stepsIn = Array.isArray(raw.steps) ? raw.steps : []
  if (stepsIn.length === 0) return null

  const steps: TaskPlanStep[] = []
  for (let i = 0; i < stepsIn.length; i++) {
    const s = stepsIn[i]!
    const action = typeof s.action === 'string' ? (s.action.trim() as DesktopAgentAction) : null
    if (!action || !ALLOWED.has(action)) continue

    const needsPath = !['open_app', 'close_app', 'focus_app'].includes(action)
    let path: string | undefined
    if (typeof s.path === 'string' && s.path.trim()) {
      path = expandPlanPath(s.path.trim(), desktopPath)
    } else if (needsPath) {
      continue
    }

    const label =
      typeof s.label === 'string' && s.label.trim()
        ? s.label.trim()
        : `${action}${path ? ` ${path}` : ''}`

    const step: TaskPlanStep = {
      id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `step_${i + 1}`,
      label,
      action,
      path,
      options: s.options,
      verify: defaultVerifyForStep({ action, path }),
      status: 'pending'
    }
    steps.push(step)
  }

  if (steps.length === 0) return null

  return {
    id: planId,
    sourceText,
    goalSummary:
      typeof raw.goalSummary === 'string' && raw.goalSummary.trim()
        ? raw.goalSummary.trim()
        : sourceText.slice(0, 120),
    steps,
    createdAt: new Date().toISOString(),
    planner: 'llm'
  }
}

/** 规则模板计划补齐 goalSummary / planner 字段 */
export function finalizeRegexTaskPlan(plan: DesktopAgentTaskPlan): DesktopAgentTaskPlan {
  return {
    ...plan,
    goalSummary: plan.goalSummary || plan.sourceText.slice(0, 120),
    planner: 'regex'
  }
}
