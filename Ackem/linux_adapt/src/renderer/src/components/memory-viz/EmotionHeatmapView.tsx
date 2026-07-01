// [memory-viz/EmotionHeatmapView] — 情绪热力图

import { useState, useMemo } from 'react'
import { useMemoryVizData } from './useMemoryVizData'
import { VizDetailPanel } from './VizDetailPanel'
import type { MemoryFact, HeatmapCell } from './types'
import { t } from '../../lib/i18n'

const DOMAIN_ORDER = ['IDENTITY', 'SOCIAL', 'DAILY_LIFE', 'PURSUITS', 'INNER_WORLD', 'TEMPORAL']

const ALL_SUBCATS = [
  'BASIC_PROFILE', 'LIFE_STORY', 'VALUES_BELIEFS', 'SELF_PERCEPTION',
  'OUR_BOND', 'FAMILY', 'FRIENDS', 'PARTNER',
  'ROUTINES', 'HEALTH', 'LIVING_SPACE', 'LIFESTYLE',
  'CAREER', 'LEARNING', 'GOALS', 'PROJECTS', 'PROCEDURES',
  'MOOD', 'TASTES', 'VULNERABILITIES', 'INSIDE_JOKES',
  'NOW', 'COMMITMENTS', 'PLANS', 'WORLD',
  'NOTE',
]

function sortSubcategories(subcatSet: Set<string>): string[] {
  return [...subcatSet].sort((a, b) => {
    const ai = ALL_SUBCATS.indexOf(a)
    const bi = ALL_SUBCATS.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function cellColor(valence: number, intensity: number): string {
  const sat = 30 + intensity * 60
  const light = 45
  if (valence >= 0) {
    return `hsl(${45 - valence * 40}, ${sat}%, ${light}%)`
  }
  return `hsl(${210 + Math.abs(valence) * 60}, ${sat}%, ${light}%)`
}

function buildHeatmapData(facts: MemoryFact[]): Map<string, HeatmapCell> {
  const map = new Map<string, HeatmapCell>()
  for (const f of facts) {
    const date = f.createdAt.slice(0, 10)
    const key = `${date}||${f.subcategory}`
    let cell = map.get(key)
    if (!cell) {
      cell = { date, subcategory: f.subcategory, count: 0, avgValence: 0, avgIntensity: 0, facts: [] }
      map.set(key, cell)
    }
    cell.count++
    cell.avgValence += f.emotionalContext.valence
    cell.avgIntensity += f.emotionalContext.intensity
    cell.facts.push(f)
  }
  for (const cell of map.values()) {
    cell.avgValence /= cell.count
    cell.avgIntensity /= cell.count
  }
  return map
}

export function EmotionHeatmapView(): JSX.Element {
  const { facts, loading } = useMemoryVizData()
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null)
  const [selectedFact, setSelectedFact] = useState<MemoryFact | null>(null)
  const [hoverCell, setHoverCell] = useState<HeatmapCell | null>(null)

  const { dates, subcats, cellMap } = useMemo(() => {
    const cellMap = buildHeatmapData(facts)
    const dateSet = new Set<string>()
    for (const c of cellMap.values()) dateSet.add(c.date)
    const dates = [...dateSet].sort()

    const subcatSet = new Set<string>()
    for (const f of facts) subcatSet.add(f.subcategory)
    const subcats = sortSubcategories(subcatSet)

    return { dates, subcats, cellMap }
  }, [facts])

  const filteredSubcats = useMemo(() => {
    if (domainFilter === 'all') return subcats
    const domainSubcats = new Set(
      DOMAIN_ORDER.includes(domainFilter)
        ? subcats.filter(s => {
            const idx = ALL_SUBCATS.indexOf(s)
            const ranges: Record<string, [number, number]> = {
              IDENTITY: [0, 4], SOCIAL: [4, 8], DAILY_LIFE: [8, 12],
              PURSUITS: [12, 17], INNER_WORLD: [17, 21], TEMPORAL: [21, 25]
            }
            const r = ranges[domainFilter]
            return r ? idx >= r[0] && idx < r[1] : false
          })
        : []
    )
    return subcats.filter(s => domainSubcats.has(s))
  }, [subcats, domainFilter])

  const cellW = 32
  const cellH = 24
  const labelW = 80
  const headerH = 60
  const domainLabelH = 20
  const svgW = labelW + dates.length * cellW + 20
  const svgH = headerH + domainLabelH + filteredSubcats.length * cellH + 20

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-ink-muted text-sm">{t('timeline.loading')}</div>
  }

  if (facts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
        <div className="text-4xl">🎨</div>
        <div className="text-sm text-ink-muted">{t('viz.noMemoryData')}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-surface-inset bg-surface-raised px-4 py-2">
        <span className="text-xs text-ink-muted">{facts.length} {t('viz.facts')} · {dates.length} {t('viz.days')} · {filteredSubcats.length} {t('viz.subcategory')}</span>
        <select
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
          className="field-input rounded-lg py-1 px-2 text-xs"
        >
          <option value="all">{t('viz.allDomains')}</option>
          {DOMAIN_ORDER.map(d => (
            <option key={d} value={d}>{t('domain.' + d)}</option>
          ))}
        </select>
        {hoverCell && (
          <span className="text-xs text-ink">
            {hoverCell.date} · {t('subcat.' + hoverCell.subcategory) ?? hoverCell.subcategory} ·
            {hoverCell.count} {t('viz.items')} · {t('viz.valence')} {hoverCell.avgValence.toFixed(2)}
          </span>
        )}
      </div>

      {/* Heatmap */}
      <div className="flex-1 overflow-auto p-4">
        <svg width={svgW} height={svgH}>
          {/* Date headers */}
          {dates.map((d, i) => (
            <text
              key={d}
              x={labelW + i * cellW + cellW / 2}
              y={headerH - 8}
              fill="#999"
              fontSize={9}
              textAnchor="middle"
              transform={`rotate(-45, ${labelW + i * cellW + cellW / 2}, ${headerH - 8})`}
            >
              {d.slice(5)}
            </text>
          ))}

          {/* Rows */}
          {filteredSubcats.map((sub, ri) => {
            const y = headerH + domainLabelH + ri * cellH
            return (
              <g key={sub}>
                {/* Row label */}
                <text x={labelW - 8} y={y + cellH / 2 + 4} fill="#999" fontSize={10} textAnchor="end">
                  {t('subcat.' + sub) ?? sub}
                </text>
                {/* Cells */}
                {dates.map((date, ci) => {
                  const key = `${date}||${sub}`
                  const cell = cellMap.get(key)
                  const x = labelW + ci * cellW
                  const fill = cell ? cellColor(cell.avgValence, cell.avgIntensity) : '#1a1a1a'
                  return (
                    <rect
                      key={key}
                      x={x}
                      y={y}
                      width={cellW - 2}
                      height={cellH - 2}
                      rx={3}
                      fill={fill}
                      opacity={cell ? 0.85 : 0.3}
                      style={{ cursor: cell ? 'pointer' : 'default' }}
                      onMouseEnter={() => cell && setHoverCell(cell)}
                      onMouseLeave={() => setHoverCell(null)}
                      onClick={() => {
                        if (cell) {
                          setSelectedCell(cell)
                          setSelectedFact(null)
                        }
                      }}
                    />
                  )
                })}
              </g>
            )
          })}

          {/* Domain separator lines */}
          {(() => {
            const ranges: Record<string, [number, number]> = {
              IDENTITY: [0, 4], SOCIAL: [4, 8], DAILY_LIFE: [8, 12],
              PURSUITS: [12, 17], INNER_WORLD: [17, 21], TEMPORAL: [21, 25]
            }
            const lines: JSX.Element[] = []
            let cumY = headerH + domainLabelH
            for (const sub of filteredSubcats) {
              // check domain boundary
              for (const [dom, [start, end]] of Object.entries(ranges)) {
                const idx = ALL_SUBCATS.indexOf(sub)
                if (idx === start && domainFilter === 'all') {
                  lines.push(
                    <text
                      key={`dom-${dom}`}
                      x={4}
                      y={cumY - 2}
                      fill="#666"
                      fontSize={9}
                    >
                      {t('domain.' + dom)}
                    </text>
                  )
                }
              }
              cumY += cellH
            }
            return lines
          })()}
        </svg>
      </div>

      {/* Detail panel */}
      <VizDetailPanel
        fact={selectedFact}
        triple={null}
        onClose={() => { setSelectedFact(null); setSelectedCell(null) }}
      />

      {/* Selected cell facts list */}
      {selectedCell && !selectedFact && (
        <div className="fixed bottom-4 right-4 w-80 max-h-64 overflow-y-auto rounded-lg border border-surface-inset bg-surface-raised p-3 shadow-lg z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-ink">
              {selectedCell.date} · {t('subcat.' + selectedCell.subcategory)}
            </span>
            <button type="button" onClick={() => setSelectedCell(null)} className="text-ink-muted text-xs">✕</button>
          </div>
          <div className="space-y-1">
            {selectedCell.facts.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFact(f)}
                className="w-full text-left text-xs text-ink hover:text-accent truncate"
              >
                {f.subject}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
