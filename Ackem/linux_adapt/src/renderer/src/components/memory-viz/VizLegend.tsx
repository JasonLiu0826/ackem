// [memory-viz/VizLegend] — 公共图例组件

import type { LegendItem } from './types'
import { t } from '../../lib/i18n'

export type DomainLegendItem = { key: string; label: string; color: string }

interface Props {
  items: LegendItem[]
  hidden: Set<string>
  onToggle: (key: string) => void
  variant?: 'panel' | 'overlay'
  domainItems?: DomainLegendItem[]
}

function EdgeSwatch({ color, dash, muted }: { color: string; dash?: string; muted?: boolean }): JSX.Element {
  const stroke = muted ? '#666' : color
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="19"
        y2="4"
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={dash ?? undefined}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function VizLegend({
  items,
  hidden,
  onToggle,
  variant = 'panel',
  domainItems = []
}: Props): JSX.Element {
  if (items.length === 0 && domainItems.length === 0) return <></>

  if (variant === 'overlay') {
    return (
      <div className="viz-legend-overlay glass-panel">
        {items.length > 0 ? (
          <div className="viz-legend-section">
            <div className="viz-legend-heading">{t('viz.legendEdges')}</div>
            <div className="viz-legend-chips">
              {items.map((item) => {
                const isHidden = hidden.has(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onToggle(item.key)}
                    className={`viz-legend-chip${isHidden ? ' viz-legend-chip--off' : ''}`}
                    title={isHidden ? t('viz.legendShow') : t('viz.legendHide')}
                  >
                    <EdgeSwatch color={item.color} dash={item.dash} muted={isHidden} />
                    <span>{item.label}</span>
                    <span className="viz-legend-chip-count">{item.count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {domainItems.length > 0 ? (
          <div className={`viz-legend-section${items.length > 0 ? ' viz-legend-section--border' : ''}`}>
            <div className="viz-legend-heading">{t('viz.legendNodes')}</div>
            <div className="viz-legend-chips">
              {domainItems.map((item) => (
                <span key={item.key} className="viz-legend-chip viz-legend-chip--static">
                  <span className="viz-legend-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-surface-inset bg-surface-raised p-3 text-xs">
      <div className="mb-1.5 font-medium text-ink-muted">{t('viz.legend')}</div>
      <div className="space-y-1">
        {items.map((item) => {
          const isHidden = hidden.has(item.key)
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggle(item.key)}
              className={`flex w-full items-center gap-2 text-left hover:text-ink ${isHidden ? 'opacity-40' : ''}`}
            >
              <EdgeSwatch color={item.color} dash={item.dash} muted={isHidden} />
              <span className="flex-1 text-ink">{item.label}</span>
              <span className="text-ink-muted">({item.count})</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
