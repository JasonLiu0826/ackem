import type { PlanSession } from '../../../../shared/planSession'
import type { AppSettings } from '../../../settings'
import type { AgentEventBus } from './eventBus'
import type { AgentRunMeta } from './types'
import type { ArtifactBundle } from './bundleTypes'
import {
  applyDeterministicFixes,
  hasFatalIssues,
  issueCodes
} from './repairHints'
import {
  buildValidationReport,
  formatValidationErrors,
  validateBundleWithSpec,
  type ValidationReport
} from './validationReport'
import { syncBundleFromDesignSpec } from '../designSpec/syncBundleFromSpec'
import { runLlmBundleRepair } from './llmRepair'
import { DEFAULT_MAX_LLM_REPAIR_ATTEMPTS } from '../../../../shared/openforuAgentTypes'

export type RepairLoopResult = {
  bundle: ArtifactBundle
  report: ValidationReport
  repaired: boolean
}

/**
 * AC-2：校验 → 确定性修复（最多 maxAttempts 轮）→ 仍失败则返回 report
 */
export function runValidateAndRepair(
  bundle: ArtifactBundle,
  session: PlanSession,
  run: AgentRunMeta,
  eventBus: AgentEventBus
): RepairLoopResult {
  let current = bundle

  if (session.designSpec) {
    const synced = syncBundleFromDesignSpec(current, session.designSpec)
    current = synced.bundle
    if (synced.fixes.length) {
      eventBus.emitFromRun(run, 'log', `Design Spec 预同步: ${synced.fixes.join(', ')}`)
    }
  }

  let report = validateBundleWithSpec(current, session.designSpec)

  if (report.ok) {
    return { bundle: current, report, repaired: false }
  }

  if (hasFatalIssues(report)) {
    return { bundle: current, report, repaired: false }
  }

  const max = run.maxRepairAttempts ?? 2
  let repaired = false

  while (!report.ok && run.repairAttempts < max) {
    run.repairAttempts += 1
    run.phase = 'repairing'
    run.updatedAt = new Date().toISOString()

    eventBus.emitFromRun(run, 'repair', `自动修复中（第 ${run.repairAttempts}/${max} 次）`, {
      repairAttempt: run.repairAttempts,
      errors: report.errors.map((e) => e.message)
    })

    const beforeCodes = issueCodes(report)
    const { bundle: next, fixedCodes } = applyDeterministicFixes(current, session, report)
    current = next
    report = validateBundleWithSpec(current, session.designSpec)

    if (fixedCodes.length > 0) {
      repaired = true
      eventBus.emitFromRun(run, 'log', `已应用确定性修复: ${fixedCodes.join(', ')}`)
    }

    if (report.ok) {
      break
    }

    if (hasFatalIssues(report)) {
      break
    }

    if (issueCodes(report).join() === beforeCodes.join()) {
      eventBus.emitFromRun(run, 'log', '本轮修复无进展，停止重试')
      break
    }
  }

  return { bundle: current, report, repaired }
}

/** P2：确定性修复后再尝试 LLM repair */
export async function runValidateAndRepairWithLlm(
  bundle: ArtifactBundle,
  session: PlanSession,
  run: AgentRunMeta,
  eventBus: AgentEventBus,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<RepairLoopResult> {
  const base = runValidateAndRepair(bundle, session, run, eventBus)
  if (base.report.ok || hasFatalIssues(base.report)) {
    return base
  }

  const maxLlm = run.maxLlmRepairAttempts ?? DEFAULT_MAX_LLM_REPAIR_ATTEMPTS
  let current = base.bundle
  let report = base.report
  let repaired = base.repaired

  while (!report.ok && (run.llmRepairAttempts ?? 0) < maxLlm) {
    run.llmRepairAttempts = (run.llmRepairAttempts ?? 0) + 1
    run.phase = 'repairing'
    run.updatedAt = new Date().toISOString()
    eventBus.emitFromRun(
      run,
      'repair',
      `LLM 修复中（第 ${run.llmRepairAttempts}/${maxLlm} 次）`,
      { repairAttempt: run.llmRepairAttempts, errors: report.errors.map((e) => e.message) }
    )

    const llm = await runLlmBundleRepair(current, session, report, settings, signal)
    if (!llm.ok) break
    current = llm.bundle
    repaired = true
    report = validateBundleWithSpec(current, session.designSpec)
    if (report.ok) {
      eventBus.emitFromRun(run, 'log', `LLM 修复成功: ${llm.summary ?? 'ok'}`)
      break
    }
    const det = runValidateAndRepair(current, session, run, eventBus)
    current = det.bundle
    report = det.report
    if (report.ok) {
      repaired = true
      break
    }
  }

  return { bundle: current, report, repaired }
}

export function assertBundleValidOrThrow(report: ValidationReport): void {
  if (report.ok) return
  if (hasFatalIssues(report)) {
    throw new Error(
      `存在无法自动修复的校验错误: ${formatValidationErrors(report)}`
    )
  }
  throw new Error(
    `校验未通过（已尝试修复 ${report.errors.length} 项）: ${formatValidationErrors(report)}`
  )
}
