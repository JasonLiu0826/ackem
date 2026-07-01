// [memory-viz/VizDetailPanel] — 右侧滑出详情面板

import type { MemoryFact, Triple } from './types'
import { t } from '../../lib/i18n'

interface Props {
  fact: MemoryFact | null
  triple: Triple | null
  associations?: Array<{ type: string; target: string; strength: number }>
  onClose: () => void
}

export function VizDetailPanel({ fact, triple, associations, onClose }: Props): JSX.Element | null {
  if (!fact && !triple) return null

  return (
    <div className="w-80 shrink-0 border-l border-surface-inset bg-surface-raised overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-inset">
        <span className="text-sm font-medium text-ink">{t('viz.detail')}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {fact && (
        <div className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{fact.subject}</h3>
          <p className="text-xs text-ink-muted leading-relaxed">{fact.summary}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-ink-muted">{t('viz.domain')}</span>
              <span className="ml-1 text-ink">{t('domain.' + fact.domain) ?? fact.domain}</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.subcategory')}</span>
              <span className="ml-1 text-ink">{t('subcat.' + fact.subcategory) ?? fact.subcategory}</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.weight')}</span>
              <span className="ml-1 text-ink">{fact.weight.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.confidence')}</span>
              <span className="ml-1 text-ink">{(fact.confidence * 100).toFixed(0)}%</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.tier')}</span>
              <span className="ml-1 text-ink">{fact.tier === 'core' ? t('viz.core') : t('viz.archived')}</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.status')}</span>
              <span className="ml-1 text-ink">{fact.status === 'active' ? t('viz.active') : t('viz.retired')}</span>
            </div>
          </div>

          <div className="border-t border-surface-inset pt-2">
            <span className="text-xs text-ink-muted">{t('viz.emotionalContext')}</span>
            <div className="grid grid-cols-2 gap-1 mt-1 text-xs">
              <div>
                <span className="text-ink-muted">{t('viz.valence')}</span>
                <span className="ml-1 text-ink">{fact.emotionalContext.valence.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-ink-muted">{t('viz.intensity')}</span>
                <span className="ml-1 text-ink">{fact.emotionalContext.intensity.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-ink-muted">{t('viz.stage')}</span>
                <span className="ml-1 text-ink">{fact.emotionalContext.relStage}</span>
              </div>
              <div>
                <span className="text-ink-muted">{t('viz.trust')}</span>
                <span className="ml-1 text-ink">{fact.emotionalContext.trust.toFixed(0)}</span>
              </div>
            </div>
          </div>

          {fact.triggers.length > 0 && (
            <div className="border-t border-surface-inset pt-2">
              <span className="text-xs text-ink-muted">{t('viz.triggers')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {fact.triggers.map((t: string) => (
                  <span key={t} className="rounded bg-surface-inset px-1.5 py-0.5 text-xs text-ink-muted">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {associations && associations.length > 0 && (
            <div className="border-t border-surface-inset pt-2">
              <span className="text-xs text-ink-muted">{t('viz.associations')} ({associations.length})</span>
              <div className="mt-1 space-y-1">
                {associations.map((a) => (
                  <div key={a.type + a.target} className="text-xs text-ink">
                    <span className="text-ink-muted">[{a.type}]</span> {a.target.slice(0, 30)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-surface-inset pt-2 text-xs text-ink-muted">
            <div>{t('viz.created')}: {fact.createdAt.slice(0, 10)}</div>
            <div>{t('viz.updated')}: {fact.updatedAt.slice(0, 10)}</div>
          </div>
        </div>
      )}

      {triple && (
        <div className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{triple.subject}</h3>
          <div className="text-xs space-y-1">
            <div>
              <span className="text-ink-muted">{t('viz.relationship')}</span>
              <span className="ml-1 text-ink">{triple.predicate}</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.object')}</span>
              <span className="ml-1 text-ink">{triple.object}</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.confidence')}</span>
              <span className="ml-1 text-ink">{(triple.confidence * 100).toFixed(0)}%</span>
            </div>
            <div>
              <span className="text-ink-muted">{t('viz.created')}</span>
              <span className="ml-1 text-ink">{triple.createdAt.slice(0, 10)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
