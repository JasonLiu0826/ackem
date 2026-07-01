import { useCallback, useState } from 'react'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'
import { MarkdownContent } from './MarkdownContent'

type Props = MemoryAuditCardPayload

export function MemoryAuditCard({
  displayTitle,
  cardBody,
  copyText,
  stats,
  mode,
}: Props): JSX.Element {
  const [copied, setCopied] = useState(false)

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
          <button
            type="button"
            onClick={() => void onCopy()}
            className="search-paper-card__copy-btn shrink-0 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm transition active:scale-[0.98]"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </header>
        <div className="search-paper-card__body prose prose-sm max-w-none dark:prose-invert">
          <MarkdownContent source={cardBody} />
        </div>
      </div>
    </article>
  )
}
