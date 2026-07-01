import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { INFERENCE_CONSENT_VERSION } from '../../../shared/types'

export type ScanEstimatePayload = {
  charCount: number
  fileCount: number
  tokenMin: number
  tokenMax: number
  isLocal: boolean
  consentVersion: number
}

type Props = {
  open: boolean
  estimate: ScanEstimatePayload | null
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** M3 六维推断知情确认（云端/本地分流文案） */
export function InferenceConsentDialog({
  open,
  estimate,
  loading = false,
  onConfirm,
  onCancel
}: Props): JSX.Element | null {
  const [checked, setChecked] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setChecked(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => cancelRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  if (!open || !estimate) return null

  const { charCount, tokenMin, tokenMax, isLocal, fileCount } = estimate
  const title = isLocal ? '确认使用本地模型推断画像' : '确认使用云端模型推断画像'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="infer-consent-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="glass-panel mx-4 w-full max-w-md rounded-2xl p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="infer-consent-title" className="mb-3 text-base font-semibold text-ink">
          {title}
        </h3>
        <div className="mb-4 space-y-2 text-sm leading-relaxed text-ink-muted">
          {isLocal ? (
            <>
              <p>
                本次操作将在 <strong className="text-ink">本机/局域网</strong> 运行推理，扫描约{' '}
                <strong className="text-ink">{charCount.toLocaleString()}</strong> 字（{fileCount}{' '}
                个文件）。
              </p>
              <p>将占用本地 CPU/GPU 算力，可能需要数秒至数分钟；大模型可能占用较多显存。</p>
              <p>文本不会离开您的设备（除非 base URL 指向远程机器）。不会消耗云端 API Token。</p>
            </>
          ) : (
            <>
              <p>
                本次操作将向您配置的 <strong className="text-ink">远端 API</strong> 发送文本，扫描约{' '}
                <strong className="text-ink">{charCount.toLocaleString()}</strong> 字（约{' '}
                {tokenMin.toLocaleString()}–{tokenMax.toLocaleString()} Token，粗估）。
              </p>
              <p>将消耗您云账户的 API Token/额度；具体计费以提供商为准。</p>
              <p>文本不会发往 Ackem 官方服务器，仅发往您在设置中填写的 base URL。</p>
            </>
          )}
          <p className="text-xs">知情同意版本 v{INFERENCE_CONSENT_VERSION}</p>
        </div>
        <label className="mb-5 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>我已阅读并理解上述说明，同意继续推断。</span>
        </label>
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!checked || loading}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? '推断中…' : '开始推断'}
          </button>
        </div>
      </div>
    </div>
  )
}
