import type { PlanNextSteps } from '../../../shared/planNextSteps'

type Props = {
  steps: PlanNextSteps
  busy?: boolean
  onConfirmPlan?: () => void
}

/** 程序化下一步指引（非 LLM 生成） */
export function PlanNextStepsPanel({ steps, busy, onConfirmPlan }: Props): JSX.Element {
  if (steps.action === 'none') return <></>

  return (
    <div className="space-y-1.5 rounded-xl border border-accent/25 bg-accent/10 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-accent/90">下一步</p>
      <p className="text-xs font-medium text-ink">{steps.title}</p>
      <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-ink-muted">
        {steps.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {steps.showConfirmButton && onConfirmPlan && (
        <button
          type="button"
          disabled={busy}
          onClick={onConfirmPlan}
          className="chat-send-btn w-full py-1.5 text-xs disabled:opacity-50"
        >
          确认方案
        </button>
      )}
    </div>
  )
}
