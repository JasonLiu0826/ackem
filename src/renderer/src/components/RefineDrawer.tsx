import { useCallback, useEffect, useState } from 'react'
import type { ExtensionItem } from './extensionTypes'

type RevisionEntry = {
  version: string
  savedAt: string
  instruction?: string
  summary?: string
}

type Props = {
  item: ExtensionItem
  open: boolean
  onClose: () => void
  onApplied?: () => void
}

export function RefineDrawer({ item, open, onClose, onApplied }: Props): JSX.Element | null {
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [history, setHistory] = useState<RevisionEntry[]>([])
  const [message, setMessage] = useState('')

  const refreshHistory = useCallback(async () => {
    try {
      const r = await window.Ackem.openforu.refine.history(item.id)
      if (r.ok) setHistory(r.entries)
    } catch {
      setHistory([])
    }
  }, [item.id])

  useEffect(() => {
    if (!open) return
    setInstruction('')
    setPreviewText('')
    setMessage('')
    void refreshHistory()
  }, [open, item.id, refreshHistory])

  if (!open) return null

  const runPreview = async () => {
    const text = instruction.trim()
    if (!text || busy) return
    setBusy(true)
    setMessage('')
    try {
      const r = await window.Ackem.openforu.refine.preview(item.id, text)
      if (r.ok && r.preview) {
        setPreviewText([r.preview.summary, r.preview.diffPreview].filter(Boolean).join('\n\n'))
      } else {
        setMessage(r.error ?? '棰勮澶辫触')
      }
    } finally {
      setBusy(false)
    }
  }

  const runApply = async () => {
    const text = instruction.trim()
    if (!text || busy) return
    setBusy(true)
    setMessage('')
    try {
      const r = await window.Ackem.openforu.refine.apply(item.id, text)
      if (r.ok && r.result) {
        setMessage(r.result.message)
        setInstruction('')
        void refreshHistory()
        onApplied?.()
      } else {
        setMessage(r.error ?? r.result?.message ?? '搴旂敤澶辫触')
      }
    } finally {
      setBusy(false)
    }
  }

  const runRollback = async (version: string) => {
    if (busy || !window.confirm(`鍥炴粴鍒?v${version}锛焋)) return
    setBusy(true)
    try {
      const kind = item.origin === 'uplugin' ? 'uplugin' : 'uskill'
      const r = await window.Ackem.openforu.refine.rollback(item.id, version, kind)
      if (r.ok) {
        setMessage(`宸插洖婊氬埌 v${version}`)
        void refreshHistory()
        onApplied?.()
      } else {
        setMessage(r.error ?? '鍥炴粴澶辫触')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90] bg-black/20"
        aria-label="鍏抽棴 Refine"
        onClick={onClose}
      />
      <aside className="glass-panel fixed bottom-0 right-0 z-[91] flex max-h-[70vh] w-[min(520px,92vw)] flex-col rounded-t-2xl border border-surface-inset/60 shadow-glow-lg">
        <header className="flex shrink-0 items-center justify-between border-b border-surface-inset/50 px-4 py-3">
          <div>
            <p className="font-display text-sm font-medium text-ink">缁х画浼樺寲</p>
            <p className="text-[10px] text-ink-muted">
              {item.name} 路 {item.id}
            </p>
          </div>
          <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={onClose}>
            鍏抽棴
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="鎻忚堪浣犳兂鏀逛粈涔堬紝渚嬪锛氭妸涓绘寜閽敼鎴愩€屽紑濮嬬粌涔犮€嶃€佸鍔犻噸缃‘璁も€?
            className="field-input w-full resize-none text-sm"
            disabled={busy}
          />

          {previewText && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-surface-inset/40 bg-black/20 p-2 font-mono text-[10px] text-ink-muted">
              {previewText}
            </pre>
          )}

          {message && (
            <div className="rounded-lg border border-surface-inset/40 bg-surface-inset/20 p-2 text-xs text-ink-muted">
              {message}
            </div>
          )}

          {history.length > 0 && (
            <div className="text-xs">
              <p className="mb-1 font-medium text-ink-muted">鐗堟湰蹇収</p>
              <ul className="space-y-1">
                {history.slice(0, 5).map((h) => (
                  <li
                    key={h.version}
                    className="flex items-center justify-between rounded-lg border border-surface-inset/30 px-2 py-1"
                  >
                    <span className="text-ink-muted">
                      v{h.version} 路 {new Date(h.savedAt).toLocaleString('zh-CN')}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[10px] text-accent hover:underline disabled:opacity-50"
                      onClick={() => void runRollback(h.version)}
                    >
                      鍥炴粴
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-surface-inset/50 p-3">
          <button
            type="button"
            disabled={busy || !instruction.trim()}
            onClick={() => void runPreview()}
            className="flex-1 rounded-lg border border-glass-border px-3 py-2 text-sm text-ink hover:border-accent/40 disabled:opacity-50"
          >
            棰勮
          </button>
          <button
            type="button"
            disabled={busy || !instruction.trim()}
            onClick={() => void runApply()}
            className="chat-send-btn flex-1 px-3 py-2 text-sm disabled:opacity-50"
          >
            搴旂敤
          </button>
        </footer>
      </aside>
    </>
  )
}
