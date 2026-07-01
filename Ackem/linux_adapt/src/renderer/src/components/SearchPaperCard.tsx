import { useCallback, useState } from 'react'
import { t } from '../lib/i18n'
import type { SearchCardPayload } from '../../../shared/searchCard'
import { MarkdownContent } from './MarkdownContent'

type Props = SearchCardPayload

export function SearchPaperCard({
  query,
  displayTitle,
  cardBody,
  sources,
  copyText,
  error,
  mode = 'knowledge'
}: Props): JSX.Element {
  const [copied, setCopied] = useState(false)
  const cardMode = mode ?? 'knowledge'
  const title = (displayTitle?.trim() || query).trim()
  const label =
    cardMode === 'plan' ? '计划书' : cardMode === 'search' ? '检索摘录' : '知识整理'
  const isSearch = cardMode === 'search'
  const [sourcesOpen, setSourcesOpen] = useState(isSearch && sources.length > 0)

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

  return (
    <article
      className="search-paper-card mr-auto max-w-[820px] w-full"
      aria-label={`${label}：${title}`}
    >
      <div className="search-paper-card__sheet rounded-lg px-4 py-3">
        <header className="search-paper-card__header mb-3 flex items-start justify-between gap-3 pb-2">
          <div className="min-w-0">
            <p className="search-paper-card__label text-[10px] font-semibold uppercase tracking-[0.2em]">
              {label}
            </p>
            <p className="search-paper-card__title mt-1 truncate text-sm font-medium" title={title}>
              {title}
            </p>
            <p className="search-paper-card__meta mt-0.5 text-[11px]">
              {error
                ? '整理未完成'
                : cardMode === 'plan'
                  ? '可执行 Markdown 计划'
                  : cardMode === 'search'
                    ? '检索简报 · 参考来源可展开'
                    : '模型知识整理'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="search-paper-card__copy-btn shrink-0 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm transition active:scale-[0.98]"
          >
            {copied ? '已复制' : '一键复制'}
          </button>
        </header>

        {error ? (
          <p className="search-paper-card__error text-sm leading-relaxed">{error}</p>
        ) : (
          <>
            <MarkdownContent
              source={cardBody}
              className="search-paper-card__body max-h-[min(78vh,720px)] overflow-y-auto pr-1"
            />

            {isSearch && sources.length > 0 && (
              <details
                className="search-paper-card__sources mt-4 pt-3"
                open={sourcesOpen}
                onToggle={(e) => setSourcesOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer select-none text-xs font-medium">
                  参考来源（{sources.length} 条）
                </summary>
                <ul className="mt-2 space-y-2 pl-1 text-xs">
                  {sources.map((s, i) => (
                    <li key={`${s.url}-${i}`} className="leading-relaxed">
                      <span className="search-paper-card__meta">{i + 1}. </span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.title}
                      </a>
                      {s.snippet ? (
                        <p className="search-paper-card__meta mt-0.5 pl-4">{s.snippet}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </article>
  )
}
