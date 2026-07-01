import { PLAN_STAGES, planStageIndex, type PlanStageId } from '../../../shared/planUi'
import { t } from '../lib/i18n'

type Props = {
  stage: PlanStageId
  userTurns: number
  variant?: 'horizontal' | 'vertical'
}

function stepClass(done: boolean, active: boolean, upcoming: boolean): string {
  if (active) {
    return 'plan-stage-step plan-stage-step--active bg-accent/15 font-medium text-accent'
  }
  if (done) {
    return 'plan-stage-step plan-stage-step--done bg-surface-inset/50 text-ink-muted'
  }
  if (upcoming) {
    return 'plan-stage-step plan-stage-step--upcoming'
  }
  return 'plan-stage-step'
}

export function PlanStageBar({ stage, userTurns, variant = 'horizontal' }: Props): JSX.Element {
  const activeIdx = planStageIndex(stage)

  if (variant === 'vertical') {
    return (
      <div className="plan-stage-sidebar">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            Plan 阶段
          </span>
          <span className="text-[10px] text-ink-muted">第 {userTurns} 轮</span>
        </div>
        <ol className="flex flex-col gap-1">
          {PLAN_STAGES.map((s, i) => {
            const done = i < activeIdx
            const active = i === activeIdx
            const upcoming = i > activeIdx
            return (
              <li
                key={s.id}
                className={`${stepClass(done, active, upcoming)} rounded-md px-2 py-1.5 text-[11px] leading-snug`}
              >
                <span className="mr-1.5 text-[10px] opacity-60">{i + 1}.</span>
                {s.label}
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="border-b border-surface-inset/40 px-4 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
          Plan 阶段
        </span>
        <span className="text-[10px] text-ink-muted">第 {userTurns} 轮 · 0~6</span>
      </div>
      <ol className="flex gap-1">
        {PLAN_STAGES.map((s, i) => {
          const done = i < activeIdx
          const active = i === activeIdx
          const upcoming = i > activeIdx
          return (
            <li
              key={s.id}
              className={`${stepClass(done, active, upcoming)} flex-1 rounded-md px-1 py-1 text-center text-[10px] leading-tight`}
              title={s.label}
            >
              {s.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
