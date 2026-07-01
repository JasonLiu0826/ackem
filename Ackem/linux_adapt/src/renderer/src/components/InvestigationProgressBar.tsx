import type { InvestigationProgressPayload } from '../../../shared/investigation'

type Props = {
  progress: InvestigationProgressPayload | null
}

export function InvestigationProgressBar({ progress }: Props) {
  if (!progress || progress.total <= 0) return null
  const pct = Math.min(100, Math.round((progress.done / progress.total) * 100))
  return (
    <div className="investigation-progress mx-4 mb-2 rounded-lg border border-ink-muted/20 bg-surface/80 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
        <span>电脑助手查找中</span>
        <span>
          {progress.done}/{progress.total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-muted/15">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 truncate text-xs text-ink-muted/90">{progress.label}</p>
    </div>
  )
}
