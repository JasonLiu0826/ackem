import type { DesktopAgentConfirmRequest } from '../../../shared/desktopAgent'

type Props = {
  request: DesktopAgentConfirmRequest | null
  onAllowOnce: () => void
  onAllowSession: () => void
  onCancel: () => void
}

export function DesktopAgentConfirmDialog({
  request,
  onAllowOnce,
  onAllowSession,
  onCancel
}: Props): JSX.Element | null {
  if (!request) return null

  const isClose = request.kind === 'close'
  const actionLabel = request.actionLabel

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="da-confirm-title"
    >
      <div className="glass-panel mx-4 w-full max-w-md rounded-2xl p-6 shadow-xl">
        <div className="mb-1 exp-title text-[10px] font-medium uppercase tracking-wide">
          实验 · 电脑助手
        </div>
        <h3 id="da-confirm-title" className="mb-3 text-base font-semibold text-ink">
          {isClose ? '确认关闭' : '确认电脑操作'}
        </h3>

        {request.hardBlockReason ? (
          <p className="mb-4 text-sm text-red-300">{request.hardBlockReason}</p>
        ) : isClose ? (
          <p className="mb-4 text-sm leading-relaxed text-ink-muted">
            Ackem 将要关闭 <strong className="text-ink">{request.target || request.path || '目标'}</strong>
            ，是否允许？
          </p>
        ) : (
          <div className="mb-4 space-y-1 text-sm leading-relaxed text-ink-muted">
            <p>
              Ackem 将要 <strong className="text-ink">{actionLabel}</strong>：
            </p>
            {request.path && <p className="break-all font-mono text-xs text-ink">{request.path}</p>}
            {request.pathTo && (
              <p className="break-all font-mono text-xs text-ink">→ {request.pathTo}</p>
            )}
            {request.url && (
              <p className="break-all font-mono text-xs text-ink">下载自：{request.url}</p>
            )}
            {request.target && !request.path && (
              <p className="text-ink">{request.target}</p>
            )}
          </div>
        )}

        {!request.hardBlockReason && (
          <>
            {request.sensitiveWarning && (
              <p className="exp-body mb-3 text-xs">⚠ {request.sensitiveWarning}</p>
            )}
            {request.pathMissing && (
              <p className="mb-3 text-xs text-ink-muted">路径可能不存在，仍将按你的确认尝试。</p>
            )}
            {isClose && (
              <p className="mb-4 text-xs text-ink-muted">关闭后未保存的内容可能丢失。</p>
            )}
            {!isClose && (
              <p className="mb-4 text-xs text-ink-muted">
                「允许本轮全部」后，浏览/搜索/读取等只读操作将不再反复询问；删除、关闭程序、安装仍单独确认。
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onAllowOnce}
                className="flex-1 rounded-xl border border-accent/35 bg-surface-raised px-4 py-2.5 text-sm text-ink transition-colors hover:border-accent/50 hover:bg-surface-inset"
              >
                允许本次
              </button>
              <button
                type="button"
                onClick={onAllowSession}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white transition-colors hover:bg-accent-hover"
              >
                允许本轮全部
              </button>
            </div>
          </>
        )}

        {request.hardBlockReason && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted"
          >
            知道了
          </button>
        )}
      </div>
    </div>
  )
}
