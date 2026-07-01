import type { PlanWorkspaceProgress } from '../../../shared/planDeploySteps'
import { t } from '../lib/i18n'

type Props = {
  progress: PlanWorkspaceProgress
  workspaceName?: string
}

function stepMark(state: PlanWorkspaceProgress['deploySteps'][number]['state']): string {
  if (state === 'done') return '✓'
  if (state === 'active') return '◉'
  if (state === 'error') return '✕'
  if (state === 'skipped') return '—'
  return '○'
}

function stepClass(state: PlanWorkspaceProgress['deploySteps'][number]['state']): string {
  if (state === 'done') return 'text-success'
  if (state === 'active') return 'text-accent font-medium'
  if (state === 'error') return 'text-red-400'
  if (state === 'skipped') return 'text-ink-muted/60 line-through'
  return 'text-ink-muted'
}

export function PlanProgressCard({ progress, workspaceName }: Props): JSX.Element {
  const doneDeploy = progress.deploySteps.filter((s) => s.state === 'done').length
  const totalDeploy = progress.deploySteps.filter((s) => s.state !== 'skipped').length

  return (
    <div className="plan-workspace-card rounded-lg border border-surface-inset/40 bg-surface-inset/10 p-2.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink">工作区进度</p>
          {workspaceName ? (
            <p className="truncate text-[10px] text-ink-muted">{workspaceName}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-[11px] font-medium tabular-nums ${
            progress.deployComplete ? 'text-success' : progress.deployError ? 'text-red-400' : 'text-accent'
          }`}
        >
          {progress.percent}%
        </span>
      </div>

      <div
        className="plan-workspace-progress mb-2 h-1.5 overflow-hidden rounded-full bg-surface-inset/60"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            progress.deployComplete
              ? 'bg-success/80'
              : progress.deployError
                ? 'bg-red-400/70'
                : 'bg-accent/75'
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <p className="mb-2 text-[10px] leading-snug text-ink-muted">{progress.currentLabel}</p>

      {progress.deployError ? (
        <p className="mb-2 rounded-md border border-red-500/25 bg-red-500/5 px-2 py-1.5 text-[10px] leading-relaxed text-red-400">
          {progress.deployError}
        </p>
      ) : null}

      {progress.showDeployPipeline && (
        <>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
              部署步骤
            </span>
            <span className="text-[10px] text-ink-muted">
              {doneDeploy}/{totalDeploy}
            </span>
          </div>
          <ul className="flex flex-col gap-y-1 text-[11px] leading-snug">
            {progress.deploySteps.map((s) => (
              <li key={s.id} className={stepClass(s.state)}>
                <span className="mr-1">{stepMark(s.state)}</span>
                {s.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
