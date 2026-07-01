type Props = {
  open: boolean
  extensionName: string
  askMessage: string
  onConfirm: (remember: boolean) => void
  onReject: (remember: boolean) => void
  /** plan 创建确认时不展示「记住选择」 */
  variant?: 'extension' | 'plan'
}

import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'

/** Extension Dispatch ask_invoke 确认（Sprint 1 #15；JP-B4 记住选择） */
export function ConfirmExtensionDialog({
  open,
  extensionName,
  askMessage,
  onConfirm,
  onReject,
  variant = 'extension'
}: Props): JSX.Element | null {
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (open) setRemember(false)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ext-confirm-title"
    >
      <div className="glass-panel mx-4 w-full max-w-md rounded-2xl p-6 shadow-xl">
        <h3 id="ext-confirm-title" className="mb-2 text-base font-semibold text-ink">
          {variant === 'plan' ? '扩展创建' : `扩展确认 · ${extensionName}`}
        </h3>
        <p className="mb-4 text-sm leading-relaxed text-ink-muted">{askMessage}</p>
        {variant === 'extension' && (
        <label className="mb-6 flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="rounded border-surface-inset"
          />
          记住我的选择（以后自动处理，不再询问）
        </label>
        )}
        {variant === 'plan' && <div className="mb-6" />}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onReject(remember)}
            className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            不用
          </button>
          <button
            type="button"
            onClick={() => onConfirm(remember)}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white transition-colors hover:bg-accent-hover"
          >
            好
          </button>
        </div>
      </div>
    </div>
  )
}
