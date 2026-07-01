import type { WebContents } from 'electron'
import type { ChecklistStep, InvestigationProgressPayload } from '../../../shared/investigation'

export function checklistProgressLabel(steps: ChecklistStep[], currentLabel?: string): string {
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const total = steps.length
  const cur = currentLabel ?? steps.find((s) => s.status === 'running')?.label ?? '准备中'
  return `电脑助手查找中 · ${done}/${total} · ${cur}`
}

export function emitInvestigationProgress(
  webContents: WebContents | undefined,
  steps: ChecklistStep[],
  currentStepId?: string
): void {
  if (!webContents) return
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const label = checklistProgressLabel(steps)
  webContents.send('chat:status', label)
  const payload: InvestigationProgressPayload = {
    done,
    total: steps.length,
    label,
    currentStepId
  }
  webContents.send('investigation:progress', payload)
}

export function clearInvestigationProgress(webContents: WebContents | undefined): void {
  webContents?.send('investigation:progress', null)
}
