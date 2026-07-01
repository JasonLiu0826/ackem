import type { DesktopAgentTaskPlan, TaskPlanProgress, TaskPlanStep } from '../../../shared/desktopAgentTaskPlan'
import { nextPendingTaskPlanStep } from './verifyTaskPlan'

export function buildTaskPlanSystemHint(plan: DesktopAgentTaskPlan): string {
  const lines = plan.steps.map(
    (s, i) => `${i + 1}. ${s.label} → use_computer action=${s.action}${s.path ? ` path=${s.path}` : ''}`
  )
  return [
    '【电脑助手 · Agent 任务计划（Codex 式闭环）】',
    `目标：${plan.goalSummary}`,
    '工作流：规划 → 逐步 use_computer 执行 → 系统自检验收 → 全部通过后才允许交付。',
    '门禁：验收未通过时禁止输出 persona 总结、禁止声称已完成；必须继续调用 use_computer。',
    '删除等非默认操作需用户在弹窗确认；若被拒绝，交付时须说明哪一步未完成。',
    '',
    '步骤清单：',
    ...lines,
    '',
    '当前步骤完成后继续下一步；仅当系统验收显示全部通过，最后一轮才可只输出交付总结。'
  ].join('\n')
}

export function buildTaskPlanContinuationPrompt(
  progress: TaskPlanProgress,
  auditSummary: string
): string {
  const next = nextPendingTaskPlanStep(progress)
  const done = progress.completedStepIds.length
  const total = progress.plan.steps.length

  const pendingLines = progress.pendingSteps.map(
    (s, i) => `${i + 1}. [待完成] ${s.label}（action=${s.action}, path=${s.path ?? '—'}）`
  )

  return [
    `【任务验收 · ${done}/${total} 步已通过】`,
    auditSummary ? `已执行记录：\n${auditSummary}` : '（尚无成功执行记录）',
    '',
    '以下步骤尚未通过验收（可能未调用工具、或被用户拒绝、或磁盘状态不符合）：',
    ...pendingLines,
    '',
    next
      ? `请立即调用 use_computer 完成下一步：${next.label}。` +
        `期望：action=${next.action}, path=${next.path ?? ''}` +
        (next.options?.content ? `, content 由你根据用户原意填写` : '') +
        '。不要输出 persona 总结，先执行工具。'
      : '请继续调用 use_computer 完成剩余步骤。',
    '全部步骤验收通过之前，禁止声称任务已完成。'
  ].join('\n')
}

export function buildTaskPlanIncompleteDelivery(progress: TaskPlanProgress): string {
  const done = progress.plan.steps.filter((s) => progress.completedStepIds.includes(s.id))
  const pending = progress.pendingSteps
  const doneLines = done.map((s) => `- 已完成：${s.label}`).join('\n')
  const pendingLines = pending.map((s) => `- 未完成：${s.label}`).join('\n')
  return [
    '多步骤任务尚未全部完成，还不能当作已交付。',
    doneLines || '- （尚无已完成步骤）',
    pendingLines,
    '你可以在聊天里让我继续完成剩余步骤，或在弹窗中允许删除等敏感操作。'
  ].join('\n')
}

export function buildTaskPlanFollowUpHonestyBlock(progress: TaskPlanProgress): string {
  const done = progress.plan.steps
    .filter((s) => progress.completedStepIds.includes(s.id))
    .map((s) => s.label)
  return [
    '【验收已通过】以下步骤均已执行并验收：',
    ...done.map((l) => `- ${l}`),
    '请基于真实完成的操作向用户交付一条完整回复；禁止描述未发生的打开/删除/读取。'
  ].join('\n')
}

export function summarizeTurnAuditForPrompt(
  entries: Array<{ action: string; path?: string; result: string }>
): string {
  if (!entries.length) return ''
  return entries
    .map((e) => `- ${e.action} ${e.path ?? ''} (${e.result})`)
    .join('\n')
}

export function stepUsesDestructiveAction(step: TaskPlanStep): boolean {
  return step.action === 'delete_path'
}
