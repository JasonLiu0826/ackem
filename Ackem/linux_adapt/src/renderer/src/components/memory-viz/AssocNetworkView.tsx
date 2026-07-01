// [memory-viz/AssocNetworkView] — 记忆关联网络

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useMemoryVizData } from './useMemoryVizData'
import { renderForceGraph, type ForceNode, type ForceEdge, type ForceGraphHandle } from './d3/forceGraph'
import { VizDetailPanel } from './VizDetailPanel'
import { VizLegend } from './VizLegend'
import type { MemoryFact, AssocNode, AssocEdge, LegendItem } from './types'
import { t } from '../../lib/i18n'

const ASSOC_STYLES: Record<string, { color: string; dash?: string; labelKey: string }> = {
  temporal:       { color: '#6DA8DB', labelKey: 'assoc.temporal' },
  entity:         { color: '#6DBF8B', labelKey: 'assoc.entity' },
  event_chain:    { color: '#DB8F6D', dash: '5,3', labelKey: 'assoc.event_chain' },
  emotion_peak:   { color: '#DB6D6D', labelKey: 'assoc.emotion_peak' },
  self_reference: { color: '#B86DDB', dash: '2,3', labelKey: 'assoc.self_reference' },
  thematic:       { color: '#8B8B8B', dash: '8,4', labelKey: 'assoc.thematic' }
}

const DOMAIN_COLORS: Record<string, string> = {
  IDENTITY: '#E8B86D', SOCIAL: '#6DBF8B', DAILY_LIFE: '#6DA8DB',
  PURSUITS: '#DB8F6D', INNER_WORLD: '#B86DDB', TEMPORAL: '#8B8B8B'
}

function buildAssocGraph(
  facts: MemoryFact[],
  associations: Array<{ id: string; fact_id_a: string; fact_id_b: string; association_type: string; strength: number }>
): { nodes: AssocNode[]; edges: AssocEdge[] } {
  const factMap = new Map(facts.map(f => [f.id, f]))
  const valid = associations.filter(a => factMap.has(a.fact_id_a) && factMap.has(a.fact_id_b))
  const involvedIds = new Set(valid.flatMap(a => [a.fact_id_a, a.fact_id_b]))

  const nodes: AssocNode[] = [...involvedIds].map(id => {
    const f = factMap.get(id)!
    const labelSource = f.summary?.trim() || f.subject
    return {
      id: f.id, label: labelSource.slice(0, 20), weight: f.weight,
      tier: f.tier ?? 'archival', domain: f.domain, subcategory: f.subcategory,
      valence: f.emotionalContext.valence, intensity: f.emotionalContext.intensity
    }
  })

  const edges: AssocEdge[] = valid.map(a => ({
    id: a.id, source: a.fact_id_a, target: a.fact_id_b,
    assocType: a.association_type, strength: a.strength
  }))

  return { nodes, edges }
}

export function AssocNetworkView(): JSX.Element {
  const { facts, associations, loading } = useMemoryVizData()
  const svgRef = useRef<SVGSVGElement>(null)
  const graphRef = useRef<ForceGraphHandle | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [selectedFact, setSelectedFact] = useState<MemoryFact | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const { nodes: assocNodes, edges: assocEdges } = useMemo(
    () => buildAssocGraph(facts, associations),
    [facts, associations]
  )

  const legendItems: LegendItem[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of assocEdges) counts.set(e.assocType, (counts.get(e.assocType) ?? 0) + 1)
    return Object.entries(ASSOC_STYLES).map(([key, s]) => ({
      key, label: t(s.labelKey), color: s.color, dash: s.dash, count: counts.get(key) ?? 0
    })).filter(i => i.count > 0)
  }, [assocEdges])

  const domainLegend = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ key: string; label: string; color: string }> = []
    for (const n of assocNodes) {
      if (seen.has(n.domain)) continue
      seen.add(n.domain)
      items.push({
        key: n.domain,
        label: t('domain.' + n.domain) !== 'domain.' + n.domain ? t('domain.' + n.domain) : n.domain,
        color: DOMAIN_COLORS[n.domain] ?? '#6DA8DB'
      })
    }
    return items
  }, [assocNodes])

  const handleToggle = useCallback((key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleNodeClick = useCallback((node: ForceNode) => {
    const f = facts.find(f => f.id === node.id)
    if (f) setSelectedFact(f)
  }, [facts])

  useEffect(() => {
    if (!svgRef.current || loading || assocNodes.length === 0) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 800
    const h = rect?.height ?? 600

    const visibleEdges = assocEdges.filter(e => !hidden.has(e.assocType))
    const visibleNodeIds = new Set(visibleEdges.flatMap(e => [e.source, e.target]))
    const visibleNodes = assocNodes.filter(n => visibleNodeIds.has(n.id))

    const fn: ForceNode[] = visibleNodes.map(n => ({
      id: n.id, label: n.label,
      radius: Math.min(6 + n.weight * 4, 24),
      color: DOMAIN_COLORS[n.domain] ?? '#6DA8DB',
      borderColor: n.tier === 'core' ? '#E8B86D' : undefined
    }))
    const fe: ForceEdge[] = visibleEdges.map(e => {
      const s = ASSOC_STYLES[e.assocType] ?? { color: '#888' }
      return {
        id: e.id, source: e.source, target: e.target,
        width: 1 + e.strength * 3, color: s.color, dash: s.dash
      }
    })

    graphRef.current?.destroy()
    graphRef.current = renderForceGraph(svgRef.current, fn, fe, {
      width: w, height: h, onNodeClick: (n) => handleNodeClick(n)
    })

    return () => { graphRef.current?.destroy(); graphRef.current = null }
  }, [assocNodes, assocEdges, loading, hidden, handleNodeClick])

  useEffect(() => {
    if (!graphRef.current) return
    if (!search.trim()) { graphRef.current.clearHighlight(); return }
    const q = search.toLowerCase()
    const matchIds = new Set(assocNodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id))
    graphRef.current.highlight(matchIds)
  }, [search, assocNodes])

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      graphRef.current?.resize(width, height)
    })
    if (canvasRef.current) obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const selectedFactAssocs = selectedFact
    ? associations
        .filter(a => a.fact_id_a === selectedFact.id || a.fact_id_b === selectedFact.id)
        .map(a => ({
          type: a.association_type,
          target: a.fact_id_a === selectedFact.id ? a.fact_id_b : a.fact_id_a,
          strength: a.strength
        }))
    : []

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-ink-muted text-sm">{t('timeline.loading')}</div>
  }

  if (assocNodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-4xl">🔗</div>
        <div className="text-sm text-ink-muted">
          {t('viz.noAssocData').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="viz-graph-toolbar">
          <div className="viz-graph-toolbar-search">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('viz.searchFact')}
              className="field-input w-full rounded-lg py-2 pl-3 pr-3 text-xs"
            />
          </div>
          <div className="viz-graph-stat-row">
            <span className="viz-stat-chip">{assocNodes.length} {t('viz.facts')}</span>
            <span className="viz-stat-chip">{assocEdges.length} {t('viz.associations')}</span>
          </div>
          <button
            type="button"
            className="btn-secondary viz-graph-reset text-xs"
            onClick={() => graphRef.current?.fitView()}
          >
            {t('viz.resetView')}
          </button>
        </div>

        <div ref={canvasRef} className="viz-graph-canvas">
          <svg ref={svgRef} className="absolute inset-0 h-full w-full" />

          <div className="viz-graph-overlay pointer-events-none">
            <div className="pointer-events-auto">
              <VizLegend
                variant="overlay"
                items={legendItems}
                hidden={hidden}
                onToggle={handleToggle}
                domainItems={domainLegend}
              />
            </div>
            <p className="viz-graph-hint">{t('viz.graphHint')}</p>
          </div>
        </div>
      </div>

      <VizDetailPanel
        fact={selectedFact}
        triple={null}
        associations={selectedFactAssocs}
        onClose={() => setSelectedFact(null)}
      />
    </div>
  )
}
