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

/** M3 鍏淮鎺ㄦ柇鐭ユ儏纭锛堜簯绔?鏈湴鍒嗘祦鏂囨锛?*/
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
  const title = isLocal ? '纭浣跨敤鏈湴妯″瀷鎺ㄦ柇鐢诲儚' : '纭浣跨敤浜戠妯″瀷鎺ㄦ柇鐢诲儚'

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
                鏈鎿嶄綔灏嗗湪 <strong className="text-ink">鏈満/灞€鍩熺綉</strong> 杩愯鎺ㄧ悊锛屾壂鎻忕害{' '}
                <strong className="text-ink">{charCount.toLocaleString()}</strong> 瀛楋紙{fileCount}{' '}
                涓枃浠讹級銆?
              </p>
              <p>灏嗗崰鐢ㄦ湰鍦?CPU/GPU 绠楀姏锛屽彲鑳介渶瑕佹暟绉掕嚦鏁板垎閽燂紱澶фā鍨嬪彲鑳藉崰鐢ㄨ緝澶氭樉瀛樸€?/p>
              <p>鏂囨湰涓嶄細绂诲紑鎮ㄧ殑璁惧锛堥櫎闈?base URL 鎸囧悜杩滅▼鏈哄櫒锛夈€備笉浼氭秷鑰椾簯绔?API Token銆?/p>
            </>
          ) : (
            <>
              <p>
                鏈鎿嶄綔灏嗗悜鎮ㄩ厤缃殑 <strong className="text-ink">杩滅 API</strong> 鍙戦€佹枃鏈紝鎵弿绾' '}
                <strong className="text-ink">{charCount.toLocaleString()}</strong> 瀛楋紙绾' '}
                {tokenMin.toLocaleString()}鈥搟tokenMax.toLocaleString()} Token锛岀矖浼帮級銆?
              </p>
              <p>灏嗘秷鑰楁偍浜戣处鎴风殑 API Token/棰濆害锛涘叿浣撹璐逛互鎻愪緵鍟嗕负鍑嗐€?/p>
              <p>鏂囨湰涓嶄細鍙戝線 Ackem 瀹樻柟鏈嶅姟鍣紝浠呭彂寰€鎮ㄥ湪璁剧疆涓～鍐欑殑 base URL銆?/p>
            </>
          )}
          <p className="text-xs">鐭ユ儏鍚屾剰鐗堟湰 v{INFERENCE_CONSENT_VERSION}</p>
        </div>
        <label className="mb-5 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>鎴戝凡闃呰骞剁悊瑙ｄ笂杩拌鏄庯紝鍚屾剰缁х画鎺ㄦ柇銆?/span>
        </label>
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-50"
          >
            鍙栨秷
          </button>
          <button
            type="button"
            disabled={!checked || loading}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? '鎺ㄦ柇涓€? : '寮€濮嬫帹鏂?}
          </button>
        </div>
      </div>
    </div>
  )
}
