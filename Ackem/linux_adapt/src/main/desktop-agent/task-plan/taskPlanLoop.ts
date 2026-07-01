import type { DesktopAgentAuditEntry } from '../../../shared/desktopAgent'
import type { DesktopAgentTaskPlan, TaskPlanProgress } from '../../../shared/desktopAgentTaskPlan'
import { evaluateTaskPlanProgress } from './verifyTaskPlan'
import {
  buildTaskPlanContinuationPrompt,
  summarizeTurnAuditForPrompt
} from './taskPlanPrompt'

export type TaskPlanLoopGateInput = {
  plan: DesktopAgentTaskPlan
  audit: DesktopAgentAuditEntry[]
  agentRound: number
  maxRounds: number
  sortedToolCount: number
  round1Text: string
}

export type TaskPlanLoopGateResult =
  | { action: 'continue'; continuationUserMessage: string; progress: TaskPlanProgress }
  | { action: 'deliver'; progress: TaskPlanProgress }
  | { action: 'incomplete'; progress: TaskPlanProgress; reason: 'max_rounds' | 'blocked' }

/**
 * Agent 闭环门禁：LLM 想纯文字退出时，先验收 TaskPlan。
 * - 未通过 → continue（注入续跑提示 + 强制 tool）
 * - 全通过 → deliver
 * - 轮次耗尽 → incomplete
 */
export function gateAgentLoopExit(input: TaskPlanLoopGateInput): TaskPlanLoopGateResult {
  const progress = evaluateTaskPlanProgress(input.plan, input.audit)

  if (progress.allPassed) {
    return { action: 'deliver', progress }
  }

  if (input.agentRound >= input.maxRounds - 1) {
    return { action: 'incomplete', progress, reason: 'max_rounds' }
  }

  // 本轮无 tool_call 但计划未完成 → 禁止早停
  if (input.sortedToolCount === 0) {
    const auditSummary = summarizeTurnAuditForPrompt(
      input.audit.map((e) => ({
        action: e.action,
        path: e.path,
        result: e.result
      }))
    )
    return {
      action: 'continue',
      progress,
      continuationUserMessage: buildTaskPlanContinuationPrompt(progress, auditSummary)
    }
  }

  // 本轮有 tool 但计划仍未完成 → 正常进入下一轮（由 shouldContinueDesktopAgentLoop 控制）
  return { action: 'continue', progress, continuationUserMessage: '' }
}

/** 工具批执行后：若计划未完成且 LLM 未继续调 use_computer，仍应续跑 */
export function shouldForceTaskPlanContinuation(
  plan: DesktopAgentTaskPlan,
  audit: DesktopAgentAuditEntry[],
  agentRound: number,
  maxRounds: number,
  willContinueToolLoop: boolean
): boolean {
  const progress = evaluateTaskPlanProgress(plan, audit)
  if (progress.allPassed) return false
  if (agentRound >= maxRounds - 1) return false
  return !willContinueToolLoop
}

export function buildPostToolTaskPlanNudge(
  plan: DesktopAgentTaskPlan,
  audit: DesktopAgentAuditEntry[]
): string | null {
  const progress = evaluateTaskPlanProgress(plan, audit)
  if (progress.allPassed) return null
  const auditSummary = summarizeTurnAuditForPrompt(
    audit.map((e) => ({ action: e.action, path: e.path, result: e.result }))
  )
  return buildTaskPlanContinuationPrompt(progress, auditSummary)
}
