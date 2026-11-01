/**
 * Plan-mode meta user messages (CC messages.ts plan_mode / plan_mode_exit spirit).
 */

export function buildPlanModeEnterAttachment(opts: {
  planFilePath: string
  planExists: boolean
  interviewPhase: boolean
  exploreN: number
  sparse: boolean
}): string {
  if (opts.sparse) {
    const workflow = opts.interviewPhase
      ? 'Iterative interview: explore, ask_user, write plan file incrementally.'
      : `PlanV2 multi-view: parallel Explore (up to ${opts.exploreN}), then exit_plan_mode.`
    return `<system-reminder>
Plan mode still active (see full instructions earlier). Read-only except plan file: ${opts.planFilePath}
${workflow}
End turns with ask_user (clarifications) or exit_plan_mode (approval). Never ask for plan approval in chat text.
</system-reminder>`
  }

  if (opts.interviewPhase) {
    const planInfo = opts.planExists
      ? `A plan file already exists at ${opts.planFilePath}. Read and edit it with search_replace / write_file.`
      : `No plan file yet. Create your plan at ${opts.planFilePath} with write_file.`
    return `<system-reminder>
Plan mode is active. Do NOT edit project files or run mutating tools until exit_plan_mode is approved — **except** the plan file below.

## Plan file (only editable file)
${planInfo}

## Iterative workflow (interview phase)
1. Explore with read-only tools (and Explore agents when useful).
2. After each discovery, update the plan file incrementally.
3. Use ask_user for decisions only the user can make (requirements, tradeoffs). Do not invent an Other option — the UI always has one for free text. Batch related questions (1–4).
4. When ready, call exit_plan_mode (reads plan from disk). Do NOT ask "is this plan OK?" in chat or via ask_user.

Your turn must end with ask_user OR exit_plan_mode.
</system-reminder>`
  }

  return `<system-reminder>
Plan mode is active (PlanV2 · multi-view). Do NOT edit project files until exit_plan_mode is approved.
The plan file at ${opts.planFilePath} may be used to draft markdown, but prefer synthesizing then exit_plan_mode.

Workflow: parallel Explore agents (distinct focus) → optional Plan agents → exit_plan_mode → wait for approval.
End turns with ask_user OR exit_plan_mode. Never ask for plan approval in chat text.
</system-reminder>`
}

export function buildPlanModeExitAttachment(opts: {
  previousMode: string
  planFilePath?: string
}): string {
  const planRef = opts.planFilePath
    ? `\nApproved plan file: ${opts.planFilePath}`
    : ''
  return `<system-reminder>
You have exited plan mode (restored toward ${opts.previousMode}). You may now edit files, run shell, and implement the approved plan.${planRef}
</system-reminder>`
}

export function buildPlanModeResumedAttachment(opts: {
  planFilePath: string
  planContent: string
}): string {
  const preview =
    opts.planContent.length > 4000
      ? `${opts.planContent.slice(0, 4000)}\n… (truncated)`
      : opts.planContent
  return `<system-reminder>
Returning to plan mode. An approved plan file exists at ${opts.planFilePath}.

Plan contents:

${preview}

If still relevant, continue from this plan or revise the file before exit_plan_mode.
</system-reminder>`
}
