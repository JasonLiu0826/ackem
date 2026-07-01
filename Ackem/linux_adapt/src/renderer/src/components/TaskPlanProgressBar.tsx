import type { TaskPlanProgressPayload } from '../../../shared/desktopAgentTaskPlan'

type Props = {
  progress: TaskPlanProgressPayload | null
}

const PHASE_LABEL: Record<TaskPlanProgressPayload['phase'], string> = {
  planning: '制定计划',
  executing: '执行中',
  verifying: '自检中',
  delivering: '交付中',
  incomplete: '未完成',
  done: '已结束'
}

export function TaskPlanProgressBar({ progress }: Props) {
  if (!progress) return null
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  return (
    <div className="taskplan-progress mx-4 mb-2 rounded-lg border border-accent/25 bg-surface/90 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
        <span>电脑助手任务 · {PHASE_LABEL[progress.phase]}</span>
        {progress.total > 0 ? (
          <span>
            {progress.done}/{progress.total}
          </span>
        ) : null}
      </div>
      {progress.total > 0 ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-muted/15">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className="mt-1 truncate text-xs font-medium text-ink/90">{progress.goalSummary}</p>
      {progress.steps.length > 0 ? (
        <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs text-ink-muted">
          {progress.steps.map((s) => (
            <li key={s.id} className="flex items-start gap-1.5">
              <span aria-hidden>
                {s.status === 'passed' ? '✓' : s.status === 'running' ? '▸' : '○'}
              </span>
              <span className={s.status === 'passed' ? 'line-through opacity-70' : ''}>{s.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
