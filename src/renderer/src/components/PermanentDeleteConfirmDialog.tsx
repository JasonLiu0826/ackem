import {
  canExecutePermanentDelete,
  permanentDeleteBlockedReason
} from '../lib/memoryGovernanceFlow'

type Props = {
  open: boolean
  busy: boolean
  previewOk: boolean
  verifiedSummary: string | null
  impactHint: string | null
  confirmChecked: boolean
  error: string | null
  onConfirmChecked: (v: boolean) => void
  onCancel: () => void
  onExecute: () => void
}

export function PermanentDeleteConfirmDialog({
  open,
  busy,
  previewOk,
  verifiedSummary,
  impactHint,
  confirmChecked,
  error,
  onConfirmChecked,
  onCancel,
  onExecute
}: Props): JSX.Element | null {
  if (!open) return null
  const block = permanentDeleteBlockedReason(
    previewOk ? { ok: true, verifiedSummary: verifiedSummary ?? undefined } : { ok: false },
    confirmChecked
  )
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="确认永久删除"
    >
      <div className="max-w-md rounded-xl bg-surface-raised p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-ink">核实并永久删除</h3>
        <p className="mt-2 text-xs text-ink-muted">
          {busy && !verifiedSummary ? '正在核对数据库…' : impactHint}
        </p>
        {verifiedSummary ? (
          <p className="mt-2 rounded-lg border border-surface-inset bg-surface px-2 py-1.5 text-xs text-ink">
            库内摘要：{verifiedSummary}
          </p>
        ) : null}
        <label className="mt-3 flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            data-testid="permanent-delete-confirm"
            checked={confirmChecked}
            disabled={!previewOk || busy}
            onChange={(e) => onConfirmChecked(e.target.checked)}
          />
          <span>我确认要永久删除该记忆条目</span>
        </label>
        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        {block && !error ? <p className="mt-2 text-xs text-ink-muted">{block}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-1.5 text-xs text-ink-muted hover:text-ink" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            data-testid="permanent-delete-execute"
            disabled={busy || !canExecutePermanentDelete(confirmChecked, previewOk)}
            className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs text-white disabled:opacity-40"
            onClick={onExecute}
          >
            执行删除
          </button>
        </div>
      </div>
    </div>
  )
}
