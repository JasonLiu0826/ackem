import { useCallback, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { t } from '../lib/i18n'

type Hit = { score: number; id: string; relPath: string; preview: string; mtimeMs: number }

export function MemoryPage(): JSX.Element {
  const pushToast = useAppStore((s) => s.pushToast)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [preview, setPreview] = useState<{ rel: string; text: string } | null>(null)

  const runSearch = useCallback(async () => {
    const term = q.trim()
    if (!term) {
      setHits([])
      return
    }
    try {
      const r = await window.Ackem.search(term, 30)
      setHits(r)
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e))
    }
  }, [pushToast, q])

  const openPreview = async (rel: string) => {
    const r = await window.Ackem.readRel(rel)
    if (!r.ok || !r.text) {
      pushToast(r.error ?? t('viz.readFailed'))
      return
    }
    setPreview({ rel, text: r.text })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface">
      <header className="border-b border-surface-inset bg-surface-raised px-6 py-4">
        <h1 className="text-base font-semibold text-ink">{t('viz.memoryTitle')}</h1>
        <p className="mt-0.5 text-xs text-ink-muted">{t('viz.memorySubtitle')}</p>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-surface-inset">
          <div className="flex gap-2 border-b border-surface-inset bg-surface-raised p-4">
            <div className="relative flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                placeholder={t('viz.searchPlaceholder')}
                className="field-input rounded-xl py-2 pl-3 pr-3 ring-accent/30 focus:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={() => void runSearch()}
              className="rounded-xl bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover"
            >
              {t('viz.search')}
            </button>
            <button
              type="button"
              onClick={async () => {
                await window.Ackem.rebuildIndex()
                pushToast(t('viz.indexRebuilt'))
                await runSearch()
              }}
              className="field-btn-secondary rounded-xl px-3 py-2 text-sm"
            >
              {t('viz.rebuildIndex')}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => void openPreview(h.relPath)}
                className="block w-full border-b border-surface-inset px-5 py-4 text-left hover:bg-surface-raised"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-ink">{h.relPath}</div>
                  <div className="shrink-0 text-xs text-ink-muted">{h.score.toFixed(2)}</div>
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-ink-muted">{h.preview}</div>
              </button>
            ))}
            {hits.length === 0 && (
              <div className="p-6 text-sm text-ink-muted">{t('viz.noResults')}</div>
            )}
          </div>
        </div>
        <aside className="w-[420px] shrink-0 bg-surface-raised">
          {!preview ? (
            <div className="p-6 text-sm text-ink-muted">{t('viz.selectPreview')}</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-surface-inset px-4 py-3">
                <div className="truncate text-xs font-medium text-ink">{preview.rel}</div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-surface-inset px-2 py-1 text-[11px] text-ink-muted hover:text-ink"
                  onClick={() => void window.Ackem.openDataFolder()}
                >
                  {t('viz.openFolder')}
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-ink">
                {preview.text}
              </pre>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
