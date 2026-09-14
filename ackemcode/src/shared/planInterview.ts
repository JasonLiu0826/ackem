/**
 * Plan-mode interview + exit-approval helpers (Claude Code 2.1.88).
 * AskUserQuestion: 2–4 options + automatic Other; ExitPlanMode: Yes variants
 * plus "No, keep planning" as an input row (Shift+Tab = approve with that text).
 */

import type { PermissionMode } from './types.js'

export const ASK_USER_OTHER_LABEL = 'Other'
export const ASK_USER_MAX_QUESTIONS = 4
export const ASK_USER_MIN_OPTIONS = 2
export const ASK_USER_MAX_OPTIONS = 4

export type AskUserOption = {
  label: string
  description?: string
  preview?: string
}

export type AskUserQuestionItem = {
  question: string
  header?: string
  options: AskUserOption[]
  multiSelect?: boolean
}

export type AskUserAnnotation = {
  preview?: string
  notes?: string
}

export type PlanExitOptionId =
  | 'yes-accept-edits'
  | 'yes-default'
  | 'yes-auto'
  | 'yes-bypass'
  | 'no-keep'

export type PlanExitOption = {
  id: PlanExitOptionId
  /** Shown in CLI / Web. */
  labelZh: string
  labelEn: string
  mode?: PermissionMode
  kind: 'choice' | 'input'
}

export function isOtherLabel(label: string): boolean {
  return /^other$/i.test(label.trim())
}

/** CC: host always appends Other; model must not invent it. */
export function optionsWithOther(options: AskUserOption[]): AskUserOption[] {
  if (options.some((o) => isOtherLabel(o.label))) return options
  return [
    ...options,
    {
      label: ASK_USER_OTHER_LABEL,
      description: 'Type your own answer'
    }
  ]
}

export function formatAskUserToolResult(opts: {
  answers: Record<string, string>
  annotations?: Record<string, AskUserAnnotation>
  cancelled?: boolean
}): string {
  if (opts.cancelled) {
    return 'User cancelled the question form. Continue without those answers.'
  }
  const lines = Object.entries(opts.answers).map(([q, a]) => `"${q}"="${a}"`)
  const noteLines: string[] = []
  if (opts.annotations) {
    for (const [q, ann] of Object.entries(opts.annotations)) {
      if (ann.notes?.trim()) noteLines.push(`notes["${q}"]="${ann.notes.trim()}"`)
      if (ann.preview?.trim()) {
        noteLines.push(`preview["${q}"]=${JSON.stringify(ann.preview.trim().slice(0, 400))}`)
      }
    }
  }
  return ['User answers:', ...lines, ...noteLines].join('\n')
}

export function buildPlanExitOptions(opts?: {
  autoAvailable?: boolean
  bypassAvailable?: boolean
}): PlanExitOption[] {
  const rows: PlanExitOption[] = [
    {
      id: 'yes-accept-edits',
      labelZh: '批准，并自动接受编辑',
      labelEn: 'Yes, auto-accept edits',
      mode: 'acceptEdits',
      kind: 'choice'
    },
    {
      id: 'yes-default',
      labelZh: '批准，每步仍询问',
      labelEn: 'Yes, manually approve edits',
      mode: 'default',
      kind: 'choice'
    }
  ]
  if (opts?.autoAvailable !== false) {
    rows.push({
      id: 'yes-auto',
      labelZh: '批准，并使用 auto',
      labelEn: 'Yes, and use auto mode',
      mode: 'auto',
      kind: 'choice'
    })
  }
  if (opts?.bypassAvailable) {
    rows.push({
      id: 'yes-bypass',
      labelZh: '批准，并绕过权限',
      labelEn: 'Yes, and bypass permissions',
      mode: 'bypassPermissions',
      kind: 'choice'
    })
  }
  rows.push({
    id: 'no-keep',
    labelZh: '不批准，继续规划',
    labelEn: 'No, keep planning',
    kind: 'input'
  })
  return rows
}

export function formatExitPlanApprovedOutput(opts: {
  nextMode: string
  plan?: string
  edited?: boolean
  acceptFeedback?: string
}): string {
  const parts = [
    `Plan approved. Left plan mode (now ${opts.nextMode}). Proceed to implement with write/edit tools as needed.`
  ]
  if (opts.edited && opts.plan?.trim()) {
    parts.push('', '## Approved Plan (edited by user):', opts.plan.trim())
  }
  if (opts.acceptFeedback?.trim()) {
    parts.push('', `User feedback on this plan: ${opts.acceptFeedback.trim()}`)
  }
  return parts.join('\n')
}

export function formatExitPlanRejectedOutput(opts: {
  keepPlanning: boolean
  feedback?: string
}): string {
  const feedback = opts.feedback?.trim()
  if (opts.keepPlanning) {
    return feedback
      ? `Plan rejected by user: ${feedback}. Stay in plan mode; revise and call exit_plan_mode again.`
      : 'Plan rejected by user. Stay in plan mode; revise the plan and call exit_plan_mode again.'
  }
  return feedback
    ? `Plan rejected by user: ${feedback}. Exited plan mode.`
    : 'Plan rejected by user. Exited plan mode.'
}

export const ASK_USER_TOOL_DESCRIPTION = `Ask the user one or more multiple-choice questions and wait. Use to gather preferences, clarify ambiguity, or choose between approaches.

Rules:
- 1–4 questions per call; each question has 2–4 options. Do NOT add an "Other" option — the host always provides it so the user can type a custom answer.
- If you recommend an option, put it first and append " (Recommended)" to the label.
- multiSelect=true when choices are not mutually exclusive.
- Optional preview on an option: markdown mockup/snippet for side-by-side comparison (single-select only).
- In plan mode: use this to resolve requirements BEFORE exit_plan_mode. Do NOT ask "Is this plan OK?" / "Should I proceed?" here — call exit_plan_mode. Do not mention "the plan" in questions; the user cannot see the plan file until exit.`
