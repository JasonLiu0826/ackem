import { useCallback, useState } from 'react'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'
import { MarkdownContent } from './MarkdownContent'
import {
  canExecutePermanentDelete,
  permanentDeleteBlockedReason
} from '../lib/memoryGovernanceFlow'

type Props = MemoryAuditCardPayload

export function MemoryAuditCard({
  displayTitle,
  cardBody,
  copyText,
  stats,
  mode,
  governanceFactId,
}: Props): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [verifiedSummary, setVerifiedSummary] = useState<string | null>(null)
  const [impactHint, setImpactHint] = useState<string | null>(null)
  const [previewOk, setPreviewOk] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = copyText
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [copyText])

  const openDeleteFlow = useCallback(async () => {
    if (!governanceFactId) return
    setDeleteOpen(true)
    setConfirmChecked(false)
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      const preview = await window.ackem.memoryPermanentDeletePreview({
        targetKind: 'fact',
        targetId: governanceFactId,
        scope: 'memory_only',
        summary: displayTitle
      })
      setPreviewOk(Boolean(preview.ok))
      setVerifiedSummary(preview.verifiedSummary ?? null)
      setImpactHint(preview.impactHint ?? null)
      if (!preview.ok) setDeleteError(preview.error ?? 'target_not_found')
    } catch (e) {
      setPreviewOk(false)
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleteBusy(false)
    }
  }, [displayTitle, governanceFactId])

  const executeDelete = useCallback(async () => {
    if (!governanceFactId) return
    const block = permanentDeleteBlockedReason(
      previewOk ? { ok: true, verifiedSummary: verifiedSummary ?? undefined } : { ok: false },
      confirmChecked
    )
    if (block || !canExecutePermanentDelete(confirmChecked, previewOk)) {
      setDeleteError(block ?? 'confirmation_required')
      return
    }
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await window.ackem.memoryPermanentDelete(
        {
          targetKind: 'fact',
          targetId: governanceFactId,
          scope: 'memory_only',
          summary: verifiedSummary ?? displayTitle
        },
        null,
        true
      )
      if (!res.ok) {
        setDeleteError(res.errorCode ?? 'delete_failed')
        return
      }
      setDeleteOpen(false)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleteBusy(false)
    }
  }, [confirmChecked, displayTitle, governanceFactId, previewOk, verifiedSummary])

  const label =
    mode === 'stats_only'
      ? '记忆统计'
      : mode === 'self_report'
        ? '认识概览'
        : mode === 'full_dump'
          ? '记忆明细'
          : '记忆精选'

  return (
    <article className="search-paper-card memory-audit-card mr-auto max-w-[820px] w-full" aria-label={displayTitle}>
      <div className="search-paper-card__sheet rounded-lg px-4 py-3">
        <header className="search-paper-card__header mb-3 flex items-start justify-between gap-3 pb-2">
          <div className="min-w-0">
            <p className="search-paper-card__label text-[10px] font-semibold uppercase tracking-[0.2em]">
              {label}
            </p>
            <p className="search-paper-card__title mt-1 truncate text-sm font-medium">{displayTitle}</p>
            <p className="search-paper-card__meta mt-0.5 text-[11px]">
              活跃 {stats.totalActiveFacts} · 列出 {stats.factsListed} · 核心 {stats.coreFacts}
              {stats.timelineCount > 0 ? ` · 时间点 ${stats.timelineCount}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => void onCopy()}
              className="search-paper-card__copy-btn rounded-md px-2.5 py-1 text-xs font-medium shadow-sm transition active:scale-[0.98]"
            >
              {copied ? '已复制' : '复制'}
            </button>
            {governanceFactId ? (
              <button
                type="button"
                className="rounded-md border border-surface-inset px-2 py-0.5 text-[10px] text-ink-muted hover:text-ink"
                onClick={() => void openDeleteFlow()}
              >
                永久删除（治理）
              </button>
            ) : null}
          </div>
        </header>
        <div className="search-paper-card__body prose prose-sm max-w-none dark:prose-invert">
          <MarkdownContent source={cardBody} />
        </div>
      </div>
      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="确认永久删除"
        >
          <div className="max-w-md rounded-xl bg-surface-raised p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-ink">核实并永久删除</h3>
            <p className="mt-2 text-xs text-ink-muted">
              {deleteBusy && !verifiedSummary ? '正在核对数据库…' : impactHint}
            </p>
            {verifiedSummary ? (
              <p className="mt-2 rounded-lg border border-surface-inset bg-surface px-2 py-1.5 text-xs text-ink">
                库内摘要：{verifiedSummary}
              </p>
            ) : null}
            <label className="mt-3 flex items-start gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={confirmChecked}
                disabled={!previewOk || deleteBusy}
                onChange={(e) => setConfirmChecked(e.target.checked)}
              />
              <span>我确认要永久删除该记忆条目</span>
            </label>
            {deleteError ? <p className="mt-2 text-xs text-red-400">{deleteError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
                onClick={() => setDeleteOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteBusy || !canExecutePermanentDelete(confirmChecked, previewOk)}
                className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                onClick={() => void executeDelete()}
              >
                执行删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
