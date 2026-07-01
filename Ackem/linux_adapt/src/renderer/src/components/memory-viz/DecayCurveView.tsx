// [memory-viz/DecayCurveView] — 遗忘曲线

import { useState, useMemo, useRef, useEffect } from 'react'
import { useMemoryVizData } from './useMemoryVizData'
import { VizDetailPanel } from './VizDetailPanel'
import type { MemoryFact, DecayCurve } from './types'
import { t } from '../../lib/i18n'

const DECAY_LAMBDA: Record<string, number> = {
  BASIC_PROFILE: 0.001, LIFE_STORY: 0.001, VALUES_BELIEFS: 0.003,
  SELF_PERCEPTION: 0.005, OUR_BOND: 0.001, FAMILY: 0.002,
  FRIENDS: 0.005, PARTNER: 0.003, ROUTINES: 0.008,
  HEALTH: 0.002, LIVING_SPACE: 0.01, LIFESTYLE: 0.01,
  CAREER: 0.005, LEARNING: 0.008, GOALS: 0.005,
  PROJECTS: 0.008, PROCEDURES: 0.002, MOOD: 0.05,
  TASTES: 0.005, VULNERABILITIES: 0.003, INSIDE_JOKES: 0.005,
  NOW: 0.1, COMMITMENTS: 0, PLANS: 0.02, WORLD: 0.1
}

function buildDecayCurves(facts: MemoryFact[]): DecayCurve[] {
  return facts.map(f => {
    const lambda = DECAY_LAMBDA[f.subcategory] ?? 0.005
    const halfLife = lambda > 0 ? Math.LN2 / lambda : Infinity
    const created = new Date(f.createdAt).getTime()
    const now = Date.now()
    const points: Array<{ t: number; w: number }> = []
    const step = Math.max(3600_000, (now - created) / 200)
    for (let t = created; t <= now; t += step) {
      const days = (t - created) / 86_400_000
      points.push({ t, w: f.weight * Math.exp(-lambda * days) })
    }
    points.push({ t: now, w: f.weight })
    return {
      factId: f.id, subject: f.subject, subcategory: f.subcategory,
      tier: f.tier ?? 'archival', status: f.status,
      sensitivity: f.sensitivity ?? 'normal', lambda, halfLife,
      createdAt: f.createdAt, currentWeight: f.weight, points
    }
  })
}

const LINE_COLORS = {
  active: '#6DBF8B', retired: '#666666', avoid: '#DB6D6D', core: '#E8B86D', commitment: '#E8B86D'
}

export function DecayCurveView(): JSX.Element {
  const { facts, loading } = useMemoryVizData()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedFact, setSelectedFact] = useState<MemoryFact | null>(null)
  const [hoverCurve, setHoverCurve] = useState<DecayCurve | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const curves = useMemo(() => buildDecayCurves(facts), [facts])

  const filtered = useMemo(() => {
    let c = curves
    if (statusFilter === 'active') c = c.filter(x => x.status === 'active')
    else if (statusFilter === 'retired') c = c.filter(x => x.status === 'retired')
    else if (statusFilter === 'core') c = c.filter(x => x.tier === 'core')
    if (search.trim()) {
      const q = search.toLowerCase()
      c = c.filter(x => x.subject.toLowerCase().includes(q))
    }
    return c
  }, [curves, statusFilter, search])

  // Stats
  const stats = useMemo(() => ({
    active: curves.filter(c => c.status === 'active').length,
    core: curves.filter(c => c.tier === 'core').length,
    retired: curves.filter(c => c.status === 'retired').length,
    commitment: curves.filter(c => c.lambda === 0).length
  }), [curves])

  // SVG layout
  const margin = { top: 20, right: 30, bottom: 40, left: 50 }
  const svgW = 800
  const svgH = 400
  const plotW = svgW - margin.left - margin.right
  const plotH = svgH - margin.top - margin.bottom

  // Compute scales
  const { xScale, yScale } = useMemo(() => {
    if (filtered.length === 0) return { xScale: (t: number) => 0, yScale: (w: number) => 0 }
    const allT = filtered.flatMap(c => c.points.map(p => p.t))
    const tMin = Math.min(...allT)
    const tMax = Math.max(...allT)
    const wMax = Math.max(...filtered.map(c => c.currentWeight), 1)
    return {
      xScale: (t: number) => margin.left + ((t - tMin) / (tMax - tMin || 1)) * plotW,
      yScale: (w: number) => margin.top + plotH - (w / wMax) * plotH
    }
  }, [filtered, plotW, plotH])

  // Path generator
  function curvePath(curve: DecayCurve): string {
    return curve.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${yScale(p.w)}`)
      .join(' ')
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-ink-muted text-sm">{t('timeline.loading')}</div>
  }

  if (facts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
        <div className="text-4xl">📉</div>
        <div className="text-sm text-ink-muted">{t('viz.noMemoryData')}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Stats cards */}
      <div className="flex gap-3 border-b border-surface-inset bg-surface-raised px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: LINE_COLORS.active }} />
          <span className="text-ink-muted">{t('viz.activeCount')}</span>
          <span className="text-ink font-medium">{stats.active}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: LINE_COLORS.core }} />
          <span className="text-ink-muted">{t('viz.coreCount')}</span>
          <span className="text-ink font-medium">{stats.core}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: LINE_COLORS.retired }} />
          <span className="text-ink-muted">{t('viz.retiredCount')}</span>
          <span className="text-ink font-medium">{stats.retired}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-muted">{t('viz.commitmentCount')}</span>
          <span className="text-ink font-medium">{stats.commitment}</span>
        </div>
        <div className="flex-1" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('viz.search') + '…'}
          className="field-input rounded-lg py-1 pl-3 pr-3 text-xs w-36"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="field-input rounded-lg py-1 px-2 text-xs"
        >
          <option value="all">{t('viz.all')}</option>
          <option value="active">{t('viz.active')}</option>
          <option value="retired">{t('viz.retired')}</option>
          <option value="core">{t('viz.core')}</option>
        </select>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-4">
        <svg ref={svgRef} width={svgW} height={svgH} className="w-full h-full">
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const y = margin.top + plotH * (1 - frac)
            return (
              <g key={frac}>
                <line x1={margin.left} y1={y} x2={margin.left + plotW} y2={y} stroke="#333" strokeWidth={0.5} />
                <text x={margin.left - 8} y={y + 4} fill="#666" fontSize={10} textAnchor="end">
                  {frac.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* X axis labels */}
          {(() => {
            if (filtered.length === 0) return null
            const allT = filtered.flatMap(c => c.points.map(p => p.t))
            const tMin = Math.min(...allT)
            const tMax = Math.max(...allT)
            const ticks = 6
            return Array.from({ length: ticks }, (_, i) => {
              const t = tMin + (i / (ticks - 1)) * (tMax - tMin)
              const d = new Date(t)
              return (
                <text
                  key={i}
                  x={xScale(t)}
                  y={margin.top + plotH + 20}
                  fill="#666"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {d.getMonth() + 1}/{d.getDate()}
                </text>
              )
            })
          })()}

          {/* Curves */}
          {filtered.map(curve => {
            const isCore = curve.tier === 'core'
            const isCommitment = curve.lambda === 0
            let color: string
            if (isCore || isCommitment) color = LINE_COLORS.core
            else if (curve.status === 'retired') color = LINE_COLORS.retired
            else if (curve.sensitivity === 'avoid') color = LINE_COLORS.avoid
            else color = LINE_COLORS.active

            const isHovered = hoverCurve?.factId === curve.factId
            const opacity = hoverCurve ? (isHovered ? 1 : 0.15) : 0.7

            return (
              <path
                key={curve.factId}
                d={curvePath(curve)}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 3 : 1.5}
                opacity={opacity}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverCurve(curve)}
                onMouseLeave={() => setHoverCurve(null)}
                onClick={() => {
                  const f = facts.find(f => f.id === curve.factId)
                  if (f) setSelectedFact(f)
                }}
              />
            )
          })}

          {/* Infinity marker for commitments */}
          {filtered.filter(c => c.lambda === 0).map(curve => {
            const lastPt = curve.points[curve.points.length - 1]
            return (
              <text
                key={`inf-${curve.factId}`}
                x={xScale(lastPt.t) + 8}
                y={yScale(lastPt.w) + 4}
                fill="#E8B86D"
                fontSize={14}
              >
                ∞
              </text>
            )
          })}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hoverCurve && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-lg border border-surface-inset bg-surface-raised px-3 py-2 shadow-lg z-50 text-xs">
          <div className="text-ink font-medium">{hoverCurve.subject}</div>
          <div className="text-ink-muted">
            {t('subcat.' + hoverCurve.subcategory) ?? hoverCurve.subcategory} ·
            λ={hoverCurve.lambda} ·
            {t('viz.halfLife')}{hoverCurve.halfLife === Infinity ? t('viz.halfLifeInfinite') : t('viz.halfLifeDays', { days: Math.round(hoverCurve.halfLife) })} ·
            {t('viz.createdOn')} {hoverCurve.createdAt.slice(0, 10)}
          </div>
        </div>
      )}

      <VizDetailPanel fact={selectedFact} triple={null} onClose={() => setSelectedFact(null)} />
    </div>
  )
}
