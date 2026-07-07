import { useEffect, useState, useCallback } from 'react'
import { formatConfidencePercent } from '../../../shared/confidence'
import { useAppStore } from '../store/appStore'
import { ConfirmDialog } from './ConfirmDialog'
import { t } from '../lib/i18n'

type MemoryFact = {
  id: string
  subcategory: string
  subject: string
  summary: string
  weight: number
  confidence: number
  createdAt: string
  emotionalContext?: { valence: number; relStage: string; trust: number }
}

function groupByDate(facts: MemoryFact[]): Map<string, MemoryFact[]> {
  const map = new Map<string, MemoryFact[]>()
  for (const f of facts) {
    const date = f.createdAt.slice(0, 10)
    const arr = map.get(date) ?? []
    arr.push(f)
    map.set(date, arr)
  }
  return new Map([...map].sort((a, b) => b[0].localeCompare(a[0])))
}

export function MemoryTimeline(): JSX.Element {
  const [facts, setFacts] = useState<MemoryFact[]>([])
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState('')
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [retireTarget, setRetireTarget] = useState<{ id: string; summary: string } | null>(null)
  const setTab = useAppStore((s) => s.setTab)
  const setDeleteAttempted = useAppStore((s) => s.setDeleteAttempted)
  const requestChatInputFocus = useAppStore((s) => s.requestChatInputFocus)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.Ackem.memoryList() as MemoryFact[]
      setFacts(list)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const off = window.Ackem.onMemoryUpdated?.(() => {
      void load()
    })
    return () => off?.()
  }, [load])

  const handleRetire = (id: string, summary: string) => {
    setRetireTarget({ id, summary })
  }

  const confirmRetire = async () => {
    if (!retireTarget) return
    await window.Ackem.memoryRetire(retireTarget.id)
    setRetireTarget(null)
    await load()
  }

  const handleUpdate = async (id: string) => {
    if (!editSummary.trim()) return
    await window.Ackem.memoryUpdate(id, { summary: editSummary })
    setEditId(null)
    await load()
  }

  const handleClearAll = () => {
    setShowArchiveDialog(true)
  }

  const confirmArchive = async () => {
    setShowArchiveDialog(false)
    await window.Ackem.memoryClearAll()
    useAppStore.getState().resetChat()
    await window.Ackem.saveChatHistory([])
    await window.Ackem.appReload()
  }

  const cancelArchive = () => {
    setShowArchiveDialog(false)
    setDeleteAttempted(true)
    setTab('chat')
    requestChatInputFocus()
  }

  const grouped = groupByDate(facts)

  return (
    <>
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-surface-inset bg-surface-raised px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-ink">{t('timeline.title')}</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {t('timeline.count', { count: facts.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs">
            {loading ? t('timeline.refreshing') : t('timeline.refresh')}
          </button>
          <button type="button" onClick={() => void handleClearAll()} className="field-btn-danger rounded-lg px-3 py-1.5 text-xs">
            {t('timeline.clearAll')}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && facts.length === 0 && (
          <div className="text-sm text-ink-muted p-4">{t('timeline.loading')}</div>
        )}

        {!loading && facts.length === 0 && (
          <div className="text-sm text-ink-muted p-4">
            {t('timeline.empty')}
          </div>
        )}

        {[...grouped].map(([date, items]) => (
          <div key={date} className="mb-6">
            <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-surface py-1">
              <div className="h-px flex-1 bg-surface-inset" />
              <span className="memory-timeline-date text-xs font-medium text-ink-muted">{date}</span>
              <div className="h-px flex-1 bg-surface-inset" />
            </div>

            <div className="space-y-2">
              {items.map(f => (
                <div key={f.id}
                  className="rounded-xl border border-surface-inset bg-surface-raised p-4 hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-medium text-accent bg-accent/10 rounded px-1.5 py-0.5">
                          {t('subcat.' + f.subcategory) ?? f.subcategory}
                        </span>
                        {f.emotionalContext && (
                          <span className={`memory-chip ${
                            f.emotionalContext.valence > 0.3 ? 'memory-chip-positive' :
                            f.emotionalContext.valence < -0.3 ? 'memory-chip-negative' :
                            'memory-chip-neutral'
                          }`}>
                            {f.emotionalContext.valence > 0.3 ? t('viz.positive') : f.emotionalContext.valence < -0.3 ? t('viz.negative') : t('viz.neutral')}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-ink">{f.subject}</div>
                      {editId === f.id ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={editSummary}
                            onChange={e => setEditSummary(e.target.value)}
                            className="field-input field-input--sm mt-2 flex-1"
                            autoFocus
                          />
                          <button type="button" onClick={() => void handleUpdate(f.id)} className="field-btn-primary rounded px-2 py-1 text-xs">{t('timeline.save')}</button>
                          <button type="button" onClick={() => setEditId(null)} className="field-btn-secondary rounded px-2 py-1 text-xs">{t('timeline.cancel')}</button>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-ink-muted line-clamp-2">{f.summary}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1 text-[10px] text-ink-muted">
                        <span title={t('viz.weight')}>W{f.weight}</span>
                        <span>路</span>
                        <span title={t('viz.confidence')}>{formatConfidencePercent(f.confidence)}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={async () => { await window.Ackem.memoryFeedback(f.id, 'thumbs_up'); await load() }}
                          title={t('timeline.useful')}
                          className="memory-action-btn memory-action-btn--success px-2 py-0.5"
                        >馃憤</button>
                        <button
                          type="button"
                          onClick={async () => { await window.Ackem.memoryFeedback(f.id, 'thumbs_down'); await load() }}
                          title={t('timeline.wrong')}
                          className="memory-action-btn memory-action-btn--warn px-2 py-0.5"
                        >馃憥</button>
                        <button
                          type="button"
                          onClick={() => { setEditId(f.id); setEditSummary(f.summary) }}
                          className="memory-action-btn px-2 py-0.5"
                        >{t('timeline.edit')}</button>
                        <button
                          type="button"
                          onClick={() => handleRetire(f.id, f.summary)}
                          className="memory-action-btn memory-action-btn--danger px-2 py-0.5"
                        >{t('timeline.archive')}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>

      {/* 鍗曟潯璁板繂褰掓。纭 */}
      <ConfirmDialog
        open={retireTarget !== null}
        title={t('timeline.archiveTitle')}
        confirmLabel={t('timeline.archiveConfirm')}
        cancelLabel={t('timeline.cancel')}
        danger
        onConfirm={() => { void confirmRetire() }}
        onCancel={() => setRetireTarget(null)}
      >
        <p>
          {t('timeline.archiveDesc')}
          <span className="text-ink font-medium">銆寋retireTarget?.summary.slice(0, 80)}{(retireTarget?.summary.length ?? 0) > 80 ? '鈥? : ''}銆?/span>
        </p>
      </ConfirmDialog>

      {/* 娓呯┖鍏ㄩ儴纭 */}
      <ConfirmDialog
        open={showArchiveDialog}
        title={t('timeline.clearAllTitle')}
        confirmLabel={t('timeline.clearAllConfirm')}
        cancelLabel={t('timeline.clearAllCancel')}
        danger
        onConfirm={() => { void confirmArchive() }}
        onCancel={cancelArchive}
      >
        <p className="leading-relaxed">
          {t('timeline.clearAllDesc')}
        </p>
      </ConfirmDialog>
    </>
  )
}
