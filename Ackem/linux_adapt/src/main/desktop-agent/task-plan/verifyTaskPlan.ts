import { existsSync, readFileSync, statSync } from 'node:fs'
import { normalize } from 'node:path'
import type { DesktopAgentAuditEntry } from '../../../shared/desktopAgent'
import type {
  DesktopAgentTaskPlan,
  TaskPlanProgress,
  TaskPlanStep,
  TaskPlanVerification
} from '../../../shared/desktopAgentTaskPlan'

function normPath(p: string): string {
  return normalize(p).toLowerCase()
}

function auditMatches(
  entry: DesktopAgentAuditEntry,
  action: DesktopAgentAuditEntry['action'],
  path: string,
  result: DesktopAgentAuditEntry['result'] = 'allowed'
): boolean {
  if (entry.action !== action) return false
  if (entry.result !== result) return false
  if (!entry.path) return false
  return normPath(entry.path) === normPath(path)
}

function verifyOne(rule: TaskPlanVerification, audit: DesktopAgentAuditEntry[]): boolean {
  switch (rule.type) {
    case 'path_exists':
      return existsSync(rule.path)
    case 'path_absent':
      return !existsSync(rule.path)
    case 'is_directory':
      return existsSync(rule.path) && statSync(rule.path).isDirectory()
    case 'file_min_bytes': {
      if (!existsSync(rule.path)) return false
      const st = statSync(rule.path)
      return st.isFile() && st.size >= rule.minBytes
    }
    case 'file_contains': {
      if (!existsSync(rule.path)) return false
      try {
        const text = readFileSync(rule.path, 'utf-8')
        if (rule.substring) return text.includes(rule.substring)
        return text.length > 0
      } catch {
        return false
      }
    }
    case 'audit_action':
      return audit.some((e) =>
        auditMatches(e, rule.action, rule.path, rule.result ?? 'allowed')
      )
    default:
      return false
  }
}

/** 单步验收：verify 数组中 audit 类规则 OR 连接，路径类规则 AND 连接 */
export function isTaskPlanStepPassed(
  step: TaskPlanStep,
  audit: DesktopAgentAuditEntry[]
): boolean {
  if (!step.verify.length) return false

  const auditRules = step.verify.filter((v) => v.type === 'audit_action')
  const fsRules = step.verify.filter((v) => v.type !== 'audit_action')

  const fsOk = fsRules.length === 0 || fsRules.every((r) => verifyOne(r, audit))
  const auditOk =
    auditRules.length === 0 || auditRules.some((r) => verifyOne(r, audit))

  return fsOk && auditOk
}

export function evaluateTaskPlanProgress(
  plan: DesktopAgentTaskPlan,
  audit: DesktopAgentAuditEntry[]
): TaskPlanProgress {
  const completedStepIds: string[] = []
  const failedSteps: TaskPlanStep[] = []
  const pendingSteps: TaskPlanStep[] = []

  for (const step of plan.steps) {
    if (isTaskPlanStepPassed(step, audit)) {
      completedStepIds.push(step.id)
    } else {
      pendingSteps.push(step)
    }
  }

  return {
    plan,
    completedStepIds,
    pendingSteps,
    failedSteps,
    allPassed: pendingSteps.length === 0 && plan.steps.length > 0
  }
}

export function nextPendingTaskPlanStep(progress: TaskPlanProgress): TaskPlanStep | null {
  return progress.pendingSteps[0] ?? null
}
