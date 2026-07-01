import type { WebContents } from 'electron'
import type { AppSettings } from '../../settings'
import type { DesktopAgentTaskPlan } from '../../../shared/desktopAgentTaskPlan'
import { isActionableDesktopAgentTask } from '../../../shared/desktopAgentTaskPlan'
import { parseDesktopAgentTaskPlan } from './parseTaskPlan'
import { finalizeRegexTaskPlan } from './normalizePlan'
import { planDesktopAgentTaskWithLlm } from './planWithLlm'
import { emitTaskPlanProgress, clearTaskPlanProgress } from './taskPlanProgress'
import {
  buildContinueTaskPlanHint,
  evaluatePersistedProgress,
  isContinueTaskPlanIntent,
  loadPersistedTaskPlan
} from './taskPlanStore'
import { createLogger } from '../../logger'

const log = createLogger('task-plan.resolve')

export type ResolveTaskPlanInput = {
  settings: AppSettings
  userText: string
  webContents: WebContents
  signal: AbortSignal
  dataRoot: string
  sessionId: string
}

export type ResolveTaskPlanResult = {
  plan: DesktopAgentTaskPlan | null
  /** 续做上次任务 */
  resumed: boolean
}

export async function resolveDesktopAgentTaskPlan(
  input: ResolveTaskPlanInput
): Promise<ResolveTaskPlanResult> {
  const text = input.userText.trim()
  const continueIntent = isContinueTaskPlanIntent(text)

  if (continueIntent) {
    const persisted = loadPersistedTaskPlan(input.dataRoot, input.sessionId)
    if (persisted && !persisted.allPassed) {
      const progress = evaluatePersistedProgress(input.dataRoot, persisted.plan)
      emitTaskPlanProgress(input.webContents, persisted.plan, 'executing', undefined, undefined)
      log.info('plan.resume', {
        id: persisted.plan.id,
        done: progress.completedStepIds.length,
        total: persisted.plan.steps.length
      })
      return {
        plan: {
          ...persisted.plan,
          sourceText: text
        },
        resumed: true
      }
    }
  }

  if (!text || (!isActionableDesktopAgentTask(text) && !continueIntent)) {
    return { plan: null, resumed: false }
  }

  emitTaskPlanProgress(input.webContents, null, 'planning', '正在理解任务并制定步骤…')

  let plan: DesktopAgentTaskPlan | null = null
  plan = await planDesktopAgentTaskWithLlm(input.settings, text, input.signal)

  if (plan) {
    log.info('plan.llm_ok', { steps: plan.steps.length, goal: plan.goalSummary })
  } else {
    const regexPlan = parseDesktopAgentTaskPlan(text)
    if (regexPlan) {
      plan = finalizeRegexTaskPlan(regexPlan)
      log.info('plan.regex_fallback', { steps: plan.steps.length })
    }
  }

  if (plan) {
    emitTaskPlanProgress(input.webContents, plan, 'executing')
  } else if (!continueIntent) {
    clearTaskPlanProgress(input.webContents)
  }

  return { plan, resumed: false }
}

export function buildTaskPlanResumeUserHint(
  input: ResolveTaskPlanInput,
  plan: DesktopAgentTaskPlan
): string | null {
  const persisted = loadPersistedTaskPlan(input.dataRoot, input.sessionId)
  if (!persisted) return null
  const progress = evaluatePersistedProgress(input.dataRoot, plan)
  return buildContinueTaskPlanHint(persisted, progress)
}

export { clearTaskPlanProgress } from './taskPlanProgress'
export {
  savePersistedTaskPlan,
  clearPersistedTaskPlan,
  readTaskPlanAudit,
  evaluatePersistedProgress
} from './taskPlanStore'
