/**
 * Task-notification payload — Claude Code <task-notification> XML spirit (portable).
 * Delivered via SessionMessageQueue mode `task-notification` (S07 drain + idle pump).
 * GM-NOTIFY: cron-due + pending-notification helpers.
 */

export type TaskNotificationStatus = 'completed' | 'failed' | 'killed'

export type TaskNotificationPayload = {
  taskId: string
  toolUseId?: string
  status: TaskNotificationStatus
  summary: string
  result?: string
  outputFile?: string
  usage?: string
}

/** Env gate (CC CLAUDE_CODE_DISABLE_BACKGROUND_TASKS spirit). */
export function isBackgroundTasksDisabled(): boolean {
  const a = process.env.ACKEM_DISABLE_BACKGROUND_TASKS
  const b = process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
  return a === '1' || a === 'true' || b === '1' || b === 'true'
}

export function formatTaskNotificationXml(
  payload: TaskNotificationPayload
): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = [
    '<task-notification>',
    `  <task-id>${esc(payload.taskId)}</task-id>`
  ]
  if (payload.toolUseId) {
    lines.push(`  <tool-use-id>${esc(payload.toolUseId)}</tool-use-id>`)
  }
  if (payload.outputFile) {
    lines.push(`  <output-file>${esc(payload.outputFile)}</output-file>`)
  }
  lines.push(`  <status>${esc(payload.status)}</status>`)
  lines.push(`  <summary>${esc(payload.summary.slice(0, 500))}</summary>`)
  if (payload.result?.trim()) {
    lines.push(`  <result>${esc(payload.result.slice(0, 4000))}</result>`)
  }
  if (payload.usage?.trim()) {
    lines.push(`  <usage>${esc(payload.usage)}</usage>`)
  }
  lines.push('</task-notification>')
  return lines.join('\n')
}

/** Cron due → queue payload (GM-NOTIFY chain with idle pump). */
export function formatCronDueNotification(job: {
  id: string
  cron: string
  prompt: string
  humanSchedule?: string
}): string {
  const schedule = job.humanSchedule || job.cron
  return formatTaskNotificationXml({
    taskId: `cron:${job.id}`,
    status: 'completed',
    summary: `Cron fired (${schedule})`,
    result: job.prompt
  })
}

export function summarizeAgentResult(opts: {
  ok: boolean
  killed?: boolean
  report: string
  error?: string
  description?: string
}): { status: TaskNotificationStatus; summary: string } {
  if (opts.killed) {
    return {
      status: 'killed',
      summary: opts.description
        ? `Background agent killed: ${opts.description}`
        : 'Background agent killed'
    }
  }
  if (!opts.ok) {
    return {
      status: 'failed',
      summary:
        opts.error ||
        opts.report.slice(0, 200) ||
        (opts.description
          ? `Background agent failed: ${opts.description}`
          : 'Background agent failed')
    }
  }
  return {
    status: 'completed',
    summary:
      opts.description ||
      opts.report.split('\n').find((l) => l.trim())?.slice(0, 200) ||
      'Background agent completed'
  }
}
