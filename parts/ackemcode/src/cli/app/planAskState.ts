/**
 * CLI state helpers for AskUserQuestion + ExitPlanMode (CC 2.1.88).
 */
import type { AskUserQuestionItem } from '../../shared/planInterview.js'
import {
  ASK_USER_OTHER_LABEL,
  buildPlanExitOptions,
  isOtherLabel,
  optionsWithOther,
  type PlanExitOption
} from '../../shared/planInterview.js'
import type { PermissionMode } from '../../shared/types.js'

export type CliAskState = {
  requestId: string
  questions: AskUserQuestionItem[]
  qIndex: number
  picked: Record<string, string[]>
  otherText: Record<string, string>
  notes: Record<string, string>
  otherEditing: boolean
}

export function createCliAskState(
  requestId: string,
  questions: AskUserQuestionItem[]
): CliAskState {
  return {
    requestId,
    questions,
    qIndex: 0,
    picked: {},
    otherText: {},
    notes: {},
    otherEditing: false
  }
}

export function displayedAskOptions(ask: CliAskState): AskUserQuestionItem['options'] {
  const q = ask.questions[ask.qIndex]
  if (!q) return []
  return optionsWithOther(q.options)
}

export function currentAskQuestion(ask: CliAskState): AskUserQuestionItem | undefined {
  return ask.questions[ask.qIndex]
}

export function buildAskAnswerPayload(ask: CliAskState): {
  answers: Record<string, string>
  annotations?: Record<string, { notes?: string; preview?: string }>
} {
  const answers: Record<string, string> = {}
  const annotations: Record<string, { notes?: string; preview?: string }> = {}
  for (const q of ask.questions) {
    const sel = [...(ask.picked[q.question] || [])]
    const other = (ask.otherText[q.question] || '').trim()
    if (other) sel.push(`${ASK_USER_OTHER_LABEL}: ${other}`)
    answers[q.question] = sel.join(', ')
    const notes = (ask.notes[q.question] || '').trim()
    const preview = q.options.find((o) => sel.includes(o.label))?.preview
    if (notes || preview) {
      annotations[q.question] = {
        ...(notes ? { notes } : {}),
        ...(preview ? { preview } : {})
      }
    }
  }
  return {
    answers,
    annotations: Object.keys(annotations).length ? annotations : undefined
  }
}

export function planExitRows(opts?: {
  autoAvailable?: boolean
  bypassAvailable?: boolean
}): PlanExitOption[] {
  return buildPlanExitOptions(opts)
}

export function planExitChoice(id: PlanExitOption['id']): {
  decision: 'approve' | 'reject'
  mode?: PermissionMode
  rejectAction?: 'keep_planning'
} {
  if (id === 'no-keep') {
    return { decision: 'reject', rejectAction: 'keep_planning' }
  }
  const mode: PermissionMode =
    id === 'yes-accept-edits'
      ? 'acceptEdits'
      : id === 'yes-auto'
        ? 'auto'
        : id === 'yes-bypass'
          ? 'bypassPermissions'
          : 'default'
  return { decision: 'approve', mode }
}

export { isOtherLabel, ASK_USER_OTHER_LABEL }
