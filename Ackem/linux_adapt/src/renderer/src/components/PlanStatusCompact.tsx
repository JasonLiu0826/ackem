import { PLAN_STAGES, planStageIndex, type PlanStageId } from '../../../shared/planUi'
import { t } from '../lib/i18n'
import type { PlanWorkspaceProgress } from '../../../shared/planDeploySteps'

type Props = {
  stage: PlanStageId
  progress: PlanWorkspaceProgress
  workspaceName?: string
}

export function PlanStatusCompact({ stage, progress, workspaceName }: Props): JSX.Element {
  const stageLabel = PLAN_STAGES[planStageIndex(stage)]?.label ?? stage
  const waitingPermission = /权限/.test(progress.currentLabel)

  return (
    <div className="plan-status-compact rounded-lg border border-surface-inset/40 bg-surface-inset/10 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-ink">
            {stageLabel}
            {workspaceName ? (
              <span className="font-normal text-ink-muted"> · {workspaceName}</span>
            ) : null}
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] tabular-nums ${
            progress.deployComplete
              ? 'text-success'
              : progress.deployError
                ? 'text-red-400'
                : 'text-accent'
          }`}
        >
          {progress.percent}%
        </span>
      </div>
      <div
        className="mb-1.5 h-1 overflow-hidden rounded-full bg-surface-inset/60"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            waitingPermission
              ? 'w-2/5 animate-pulse bg-accent/50'
              : progress.deployComplete
                ? 'bg-success/80'
                : progress.deployError
                  ? 'bg-red-400/70'
                  : 'bg-accent/75'
          }`}
          style={waitingPermission ? undefined : { width: `${progress.percent}%` }}
        />
      </div>
      <p className="truncate text-[10px] text-ink-muted">{progress.currentLabel}</p>
      {progress.deployError ? (
        <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-red-400">{progress.deployError}</p>
      ) : null}
    </div>
  )
}
