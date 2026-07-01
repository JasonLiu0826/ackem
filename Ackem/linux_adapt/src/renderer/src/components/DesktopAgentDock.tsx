import { useEffect, useState } from 'react'
import type { DesktopAgentConfirmRequest } from '../../../shared/desktopAgent'
import type { TaskPlanProgressPayload } from '../../../shared/desktopAgentTaskPlan'
import type {
  DesktopAgentJobStatePayload,
  DesktopAgentTaskDeliveryPayload
} from '../../../shared/desktopAgentDock'

type Props = {
  sessionId: string
  progress: TaskPlanProgressPayload | null
  confirm: DesktopAgentConfirmRequest | null
  jobState: DesktopAgentJobStatePayload | null
  jobStatusLabel: string | null
  pendingDelivery: DesktopAgentTaskDeliveryPayload | null
  onAllowOnce: () => void
  onAllowSession: () => void
  onAllowTaskDeletes: () => void
  onDeny: () => void
  onViewDelivery: () => void
  onDismissDelivery: () => void
}

const PHASE_LABEL: Record<NonNullable<TaskPlanProgressPayload>['phase'], string> = {
  planning: '制定计划',
  executing: '执行中',
  verifying: '自检中',
  delivering: '交付中',
  incomplete: '未完成',
  done: '已结束'
}

export function DesktopAgentDock({
  sessionId,
  progress,
  confirm,
  jobState,
  jobStatusLabel,
  pendingDelivery,
  onAllowOnce,
  onAllowSession,
  onAllowTaskDeletes,
  onDeny,
  onViewDelivery,
  onDismissDelivery
}: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(true)

  const jobActive = jobState?.active === true
  const jobFailed = jobState?.phase === 'failed'
  const hasProgressDetail = progress != null && progress.phase !== 'done'
  const visible =
    jobActive || jobFailed || hasProgressDetail || confirm != null || pendingDelivery != null

  useEffect(() => {
    if (!visible) setExpanded(true)
  }, [visible])

  if (!visible) return null

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0

  const collapsedLabel =
    confirm != null
      ? `等待确认：${confirm.actionLabel}`
      : pendingDelivery != null
        ? pendingDelivery.allPassed
          ? '任务已完成'
          : '任务未完成'
        : hasProgressDetail
          ? `${progress!.done}/${progress!.total} · ${PHASE_LABEL[progress!.phase]}`
          : jobFailed
            ? (jobState?.label ?? '任务失败')
            : jobActive
              ? (jobStatusLabel ?? '电脑助手运行中')
              : '电脑助手'

  return (
    <div className="desktop-agent-dock border-t border-accent/20 bg-surface/95 px-4 py-2">
      <div className="mx-auto flex max-w-[920px] flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              {jobActive ? (
                <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
              ) : jobFailed ? (
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              ) : (
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent/50" />
              )}
              <span className="truncate font-medium text-ink/90">电脑助手</span>
              <span className="truncate">{collapsedLabel}</span>
            </div>
            {!expanded && hasProgressDetail && progress!.total > 0 ? (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-muted/15">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-inset hover:text-ink"
          >
            {expanded ? '收起' : '展开'}
          </button>
        </div>

        {expanded ? (
          <>
            {pendingDelivery ? (
              <div className="rounded-xl border border-accent/30 bg-surface-inset/40 px-3 py-2 text-sm">
                <p className="font-medium text-ink">
                  {pendingDelivery.allPassed ? '任务已完成' : '任务未完成'} ·{' '}
                  {pendingDelivery.goalSummary}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-ink-muted">{pendingDelivery.text}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onViewDelivery}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover"
                  >
                    {pendingDelivery.queued ? '插入到聊天' : '查看详情'}
                  </button>
                  <button
                    type="button"
                    onClick={onDismissDelivery}
                    className="rounded-lg border border-surface-inset px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
                  >
                    关闭
                  </button>
                </div>
              </div>
            ) : null}

            {confirm ? (
              <div className="exp-panel rounded-xl px-3 py-3">
                <p className="exp-title text-xs font-medium uppercase tracking-wide">
                  待确认操作
                </p>
                {confirm.hardBlockReason ? (
                  <p className="mt-2 text-sm text-red-300">{confirm.hardBlockReason}</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-ink">
                      将要 <strong>{confirm.actionLabel}</strong>
                      {confirm.path ? (
                        <span className="mt-1 block break-all font-mono text-xs text-ink-muted">
                          {confirm.path}
                        </span>
                      ) : null}
                    </p>
                    {confirm.sensitiveWarning ? (
                      <p className="exp-body mt-1 text-xs">⚠ {confirm.sensitiveWarning}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onDeny}
                        className="rounded-lg border border-surface-inset px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={onAllowOnce}
                        className="rounded-lg border border-accent/35 px-3 py-1.5 text-xs text-ink hover:bg-surface-inset"
                      >
                        允许本次
                      </button>
                      {confirm.showTaskDeleteBatch && confirm.taskPlanId ? (
                        <button
                          type="button"
                          onClick={onAllowTaskDeletes}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover"
                        >
                          本任务内删除均允许
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onAllowSession}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover"
                        >
                          允许本轮只读
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {hasProgressDetail ? (
              <div className="rounded-xl border border-accent/20 bg-surface/80 px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                  <span>{PHASE_LABEL[progress.phase]}</span>
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
                  <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-xs text-ink-muted">
                    {progress.steps.map((s) => (
                      <li key={s.id} className="flex items-start gap-1.5">
                        <span aria-hidden>
                          {s.status === 'passed' ? '✓' : s.status === 'running' ? '▸' : '○'}
                        </span>
                        <span className={s.status === 'passed' ? 'line-through opacity-70' : ''}>
                          {s.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : jobFailed ? (
              <p className="text-xs text-red-300">{jobState?.label ?? '电脑助手任务失败'}</p>
            ) : jobActive ? (
              <p className="text-xs text-ink-muted">{jobStatusLabel ?? '任务执行中…'}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
