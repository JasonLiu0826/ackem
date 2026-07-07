// [memory-viz/KgGraphView] 鈥?鐭ヨ瘑鍥捐氨鍔涘鍚戝浘

import { useRef, useEffect, useState, useCallback } from 'react'
import { useMemoryVizData } from './useMemoryVizData'
import { renderForceGraph, type ForceNode, type ForceEdge, type ForceGraphHandle } from './d3/forceGraph'
import { VizDetailPanel } from './VizDetailPanel'
import type { KgGraphNode, KgGraphEdge, Triple } from './types'
import { t } from '../../lib/i18n'

const DOMAIN_COLORS: Record<string, string> = {
  IDENTITY: '#E8B86D',
  SOCIAL: '#6DBF8B',
  DAILY_LIFE: '#6DA8DB',
  PURSUITS: '#DB8F6D',
  INNER_WORLD: '#B86DDB',
  TEMPORAL: '#8B8B8B'
}

function buildKgGraph(triples: Triple[]): { nodes: KgGraphNode[]; edges: KgGraphEdge[] } {
  const nodeMap = new Map<string, KgGraphNode>()
  function getOrCreate(name: string): KgGraphNode {
    let n = nodeMap.get(name)
    if (!n) { n = { id: name, label: name, degree: 0 }; nodeMap.set(name, n) }
    n.degree++
    return n
  }
  const edges: KgGraphEdge[] = triples.map(t => {
    getOrCreate(t.subject)
    getOrCreate(t.object)
    return { id: t.id, source: t.subject, target: t.object, predicate: t.predicate, confidence: t.confidence }
  })
  return { nodes: [...nodeMap.values()], edges }
}

export function KgGraphView(): JSX.Element {
  const { triples, loading } = useMemoryVizData()
  const svgRef = useRef<SVGSVGElement>(null)
  const graphRef = useRef<ForceGraphHandle | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [selectedTriple, setSelectedTriple] = useState<Triple | null>(null)
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [oneHop, setOneHop] = useState<Triple[]>([])

  const handleNodeClick = useCallback(async (node: ForceNode) => {
    setSelectedEntity(node.label)
    try {
      const hops = await window.Ackem.kgOneHop(node.label)
      setOneHop(hops as Triple[])
      setSelectedTriple(null)
    } catch { setOneHop([]) }
  }, [])

  useEffect(() => {
    if (!svgRef.current || loading || triples.length === 0) return
    const { nodes: kgNodes, edges: kgEdges } = buildKgGraph(triples)

    const rect = containerRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 800
    const h = rect?.height ?? 600

    const fn: ForceNode[] = kgNodes.map(n => ({
      id: n.id,
      label: n.label,
      radius: Math.min(8 + n.degree * 3, 30),
      color: DOMAIN_COLORS[n.domain ?? ''] ?? '#6DA8DB'
    }))
    const fe: ForceEdge[] = kgEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.predicate,
      width: 1 + e.confidence * 2,
      color: '#666'
    }))

    graphRef.current?.destroy()
    graphRef.current = renderForceGraph(svgRef.current, fn, fe, {
      width: w,
      height: h,
      showEdgeLabels: true,
      onNodeClick: (n) => void handleNodeClick(n)
    })

    return () => { graphRef.current?.destroy(); graphRef.current = null }
  }, [triples, loading, handleNodeClick])

  // Search highlight
  useEffect(() => {
    if (!graphRef.current) return
    if (!search.trim()) { graphRef.current.clearHighlight(); return }
    const q = search.toLowerCase()
    const matchIds = new Set(triples.flatMap(t => {
      const ids: string[] = []
      if (t.subject.toLowerCase().includes(q)) ids.push(t.subject)
      if (t.object.toLowerCase().includes(q)) ids.push(t.object)
      return ids
    }))
    graphRef.current.highlight(matchIds)
  }, [search, triples])

  // Resize
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      graphRef.current?.resize(width, height)
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-ink-muted text-sm">{t('timeline.loading')}</div>
  }

  if (triples.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
        <div className="text-4xl">馃</div>
        <div className="text-sm text-ink-muted">
          {t('viz.noKgData').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div ref={containerRef} className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-surface-inset bg-surface-raised px-4 py-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('viz.searchEntity')}
            className="field-input rounded-lg py-1.5 pl-3 pr-3 text-xs w-48"
          />
          <span className="text-xs text-ink-muted">
            {triples.length} {t('viz.triples')}
          </span>
        </div>
        <svg ref={svgRef} className="flex-1 min-h-0" />
      </div>

      <VizDetailPanel
        fact={null}
        triple={selectedTriple}
        associations={oneHop.map(t => ({ type: t.predicate, target: t.object, strength: t.confidence }))}
        onClose={() => { setSelectedTriple(null); setOneHop([]); setSelectedEntity(null) }}
      />
    </div>
  )
}
