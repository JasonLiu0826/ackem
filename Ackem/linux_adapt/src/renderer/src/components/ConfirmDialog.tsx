import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '../lib/i18n'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 应用内确认框，避免 Electron 下 window.confirm 关闭后输入框无法获得焦点 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel
}: Props): JSX.Element | null {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    // 记录当前焦点元素，供关闭后恢复
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const t = requestAnimationFrame(() => cancelRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(t)
      window.removeEventListener('keydown', onKey)
      // 对话框关闭后恢复焦点到之前的元素
      const prev = prevFocusRef.current
      if (prev && document.body.contains(prev)) {
        requestAnimationFrame(() => {
          try { prev.focus() } catch { /* ignore */ }
        })
      }
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="glass-panel mx-4 w-full max-w-md rounded-2xl p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="mb-3 text-base font-semibold text-ink">
          {title}
        </h3>
        <div className="mb-6 text-sm leading-relaxed text-ink-muted">{children}</div>
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'flex-1 rounded-xl px-4 py-2.5 text-sm text-white transition-colors',
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-hover'
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
