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
          瀹為獙 路 鐢佃剳鍔╂墜
        </div>
        <h3 id="da-confirm-title" className="mb-3 text-base font-semibold text-ink">
          {isClose ? '纭鍏抽棴' : '纭鐢佃剳鎿嶄綔'}
        </h3>

        {request.hardBlockReason ? (
          <p className="mb-4 text-sm text-red-300">{request.hardBlockReason}</p>
        ) : isClose ? (
          <p className="mb-4 text-sm leading-relaxed text-ink-muted">
            Ackem 灏嗚鍏抽棴 <strong className="text-ink">{request.target || request.path || '鐩爣'}</strong>
            锛屾槸鍚﹀厑璁革紵
          </p>
        ) : (
          <div className="mb-4 space-y-1 text-sm leading-relaxed text-ink-muted">
            <p>
              Ackem 灏嗚 <strong className="text-ink">{actionLabel}</strong>锛?
            </p>
            {request.path && <p className="break-all font-mono text-xs text-ink">{request.path}</p>}
            {request.pathTo && (
              <p className="break-all font-mono text-xs text-ink">鈫?{request.pathTo}</p>
            )}
            {request.url && (
              <p className="break-all font-mono text-xs text-ink">涓嬭浇鑷細{request.url}</p>
            )}
            {request.target && !request.path && (
              <p className="text-ink">{request.target}</p>
            )}
          </div>
        )}

        {!request.hardBlockReason && (
          <>
            {request.sensitiveWarning && (
              <p className="exp-body mb-3 text-xs">鈿?{request.sensitiveWarning}</p>
            )}
            {request.pathMissing && (
              <p className="mb-3 text-xs text-ink-muted">璺緞鍙兘涓嶅瓨鍦紝浠嶅皢鎸変綘鐨勭‘璁ゅ皾璇曘€?/p>
            )}
            {isClose && (
              <p className="mb-4 text-xs text-ink-muted">鍏抽棴鍚庢湭淇濆瓨鐨勫唴瀹瑰彲鑳戒涪澶便€?/p>
            )}
            {!isClose && (
              <p className="mb-4 text-xs text-ink-muted">
                銆屽厑璁告湰杞叏閮ㄣ€嶅悗锛屾祻瑙?鎼滅储/璇诲彇绛夊彧璇绘搷浣滃皢涓嶅啀鍙嶅璇㈤棶锛涘垹闄ゃ€佸叧闂▼搴忋€佸畨瑁呬粛鍗曠嫭纭銆?
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                鍙栨秷
              </button>
              <button
                type="button"
                onClick={onAllowOnce}
                className="flex-1 rounded-xl border border-accent/35 bg-surface-raised px-4 py-2.5 text-sm text-ink transition-colors hover:border-accent/50 hover:bg-surface-inset"
              >
                鍏佽鏈
              </button>
              <button
                type="button"
                onClick={onAllowSession}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white transition-colors hover:bg-accent-hover"
              >
                鍏佽鏈疆鍏ㄩ儴
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
            鐭ラ亾浜?
          </button>
        )}
      </div>
    </div>
  )
}
