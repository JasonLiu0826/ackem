// [memory-viz/d3/forceGraph] — D3 力导向图通用渲染

import * as d3 from 'd3'

export interface ForceNode {
  id: string
  label: string
  radius: number
  color: string
  borderColor?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  index?: number
}

export interface ForceEdge {
  id: string
  source: string | ForceNode
  target: string | ForceNode
  label?: string
  width: number
  color: string
  dash?: string
}

export interface ForceGraphOptions {
  width: number
  height: number
  onNodeClick?: (node: ForceNode) => void
  onNodeHover?: (node: ForceNode | null) => void
  onEdgeClick?: (edge: ForceEdge) => void
  showEdgeLabels?: boolean
}

export interface ForceGraphHandle {
  destroy: () => void
  highlight: (ids: Set<string>) => void
  clearHighlight: () => void
  resize: (w: number, h: number) => void
  fitView: () => void
}

export function renderForceGraph(
  svgEl: SVGSVGElement,
  nodes: ForceNode[],
  edges: ForceEdge[],
  options: ForceGraphOptions
): ForceGraphHandle {
  const { width, height, onNodeClick, onNodeHover, onEdgeClick, showEdgeLabels } = options

  const svg = d3.select(svgEl)
  svg.selectAll('*').remove()
  svg.attr('width', width).attr('height', height)

  // Zoom layer
  const g = svg.append('g')
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => g.attr('transform', event.transform))
  svg.call(zoom)

  // Simulation
  const simNodes: ForceNode[] = nodes.map(n => ({ ...n }))
  const simEdges: ForceEdge[] = edges.map(e => ({ ...e }))

  const nodeCount = Math.max(simNodes.length, 1)
  const linkDistance = Math.max(72, Math.min(148, 540 / Math.sqrt(nodeCount)))
  const chargeStrength = Math.max(-560, -72 * Math.sqrt(nodeCount))

  const simulation = d3.forceSimulation<ForceNode>(simNodes)
    .force('link', d3.forceLink<ForceNode, ForceEdge>(simEdges)
      .id(d => d.id)
      .distance(linkDistance)
      .strength(0.65)
    )
    .force('charge', d3.forceManyBody<ForceNode>().strength(chargeStrength))
    .force('center', d3.forceCenter<ForceNode>(width / 2, height / 2))
    .force('collision', d3.forceCollide<ForceNode>().radius(d => d.radius + 10))

  // Edges
  const edgeGroup = g.append('g').attr('class', 'edges')
  const edgeEls = edgeGroup.selectAll('line')
    .data(simEdges)
    .join('line')
    .attr('stroke', d => d.color)
    .attr('stroke-width', d => d.width)
    .attr('stroke-opacity', 0.5)
    .attr('stroke-dasharray', d => d.dash ?? null)
    .style('cursor', onEdgeClick ? 'pointer' : 'default')
    .on('click', (_e, d) => onEdgeClick?.(d))

  // Edge labels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let edgeLabelEls: any = null
  if (showEdgeLabels) {
    edgeLabelEls = edgeGroup.selectAll<SVGTextElement, ForceEdge>('text')
      .data(simEdges)
      .join('text')
      .attr('fill', '#888')
      .attr('font-size', 9)
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .text(d => d.label ?? '')
  }

  // Node groups
  const nodeGroup = g.append('g').attr('class', 'nodes')
  const nodeEls = nodeGroup.selectAll('g')
    .data(simNodes)
    .join('g')
    .style('cursor', 'pointer')
    .call((d3.drag<SVGGElement, ForceNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
    ) as unknown as (selection: d3.Selection<d3.BaseType | SVGGElement, ForceNode, SVGGElement, unknown>) => void)

  nodeEls.append('circle')
    .attr('r', d => d.radius)
    .attr('fill', d => d.color)
    .attr('fill-opacity', 0.8)
    .attr('stroke', d => d.borderColor ?? 'transparent')
    .attr('stroke-width', d => d.borderColor ? 2 : 0)

  nodeEls.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.radius + 14)
    .attr('fill', '#999')
    .attr('font-size', 11)
    .text(d => d.label.length > 16 ? d.label.slice(0, 16) + '…' : d.label)

  // Hover
  nodeEls
    .on('mouseenter', (_e, d) => {
      onNodeHover?.(d)
      d3.select(nodeEls.nodes()[simNodes.indexOf(d)]).select('circle')
        .attr('fill-opacity', 1)
        .attr('stroke', '#E8B86D')
        .attr('stroke-width', 2)
    })
    .on('mouseleave', (_e, d) => {
      onNodeHover?.(null)
      const el = d3.select(nodeEls.nodes()[simNodes.indexOf(d)]).select('circle')
        .attr('fill-opacity', 0.8)
      if (d.borderColor) {
        el.attr('stroke', d.borderColor).attr('stroke-width', 2)
      } else {
        el.attr('stroke', 'transparent').attr('stroke-width', 0)
      }
    })
    .on('click', (_e, d) => onNodeClick?.(d))

  // Tick
  simulation.on('tick', () => {
    edgeEls
      .attr('x1', d => (d.source as ForceNode).x!)
      .attr('y1', d => (d.source as ForceNode).y!)
      .attr('x2', d => (d.target as ForceNode).x!)
      .attr('y2', d => (d.target as ForceNode).y!)

    if (edgeLabelEls) {
      edgeLabelEls
        .attr('x', (d: ForceEdge) => ((d.source as ForceNode).x! + (d.target as ForceNode).x!) / 2)
        .attr('y', (d: ForceEdge) => ((d.source as ForceNode).y! + (d.target as ForceNode).y!) / 2)
    }

    nodeEls.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  // Highlight API
  function highlight(ids: Set<string>) {
    nodeEls.select('circle')
      .attr('fill-opacity', d => ids.has(d.id) ? 1 : 0.15)
    nodeEls.select('text')
      .attr('fill-opacity', d => ids.has(d.id) ? 1 : 0.15)
    edgeEls.attr('stroke-opacity', d => {
      const s = (d.source as ForceNode).id
      const t = (d.target as ForceNode).id
      return ids.has(s) || ids.has(t) ? 0.7 : 0.05
    })
  }

  function clearHighlight() {
    nodeEls.select('circle').attr('fill-opacity', 0.8)
    nodeEls.select('text').attr('fill-opacity', 1)
    edgeEls.attr('stroke-opacity', 0.5)
  }

  function resize(w: number, h: number) {
    svg.attr('width', w).attr('height', h)
    simulation.force('center', d3.forceCenter<ForceNode>(w / 2, h / 2))
    simulation.alpha(0.3).restart()
  }

  function fitView() {
    const layer = g.node() as SVGGElement | null
    if (!layer) return
    const bounds = layer.getBBox()
    if (!bounds.width || !bounds.height) return
    const pad = 56
    const scale = Math.min(
      (width - pad * 2) / bounds.width,
      (height - pad * 2) / bounds.height,
      1.85
    )
    const clamped = Math.max(0.4, scale)
    const tx = width / 2 - clamped * (bounds.x + bounds.width / 2)
    const ty = height / 2 - clamped * (bounds.y + bounds.height / 2)
    svg
      .transition()
      .duration(380)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(clamped))
  }

  let fitted = false
  simulation.on('end', () => {
    if (fitted) return
    fitted = true
    fitView()
  })

  return {
    destroy: () => {
      simulation.stop()
      svg.selectAll('*').remove()
    },
    highlight,
    clearHighlight,
    resize,
    fitView
  }
}
