/**
 * G-02 — collapse consecutive read/search tool rows for Ink display (display only).
 */
import { groupToolSteps } from '../../shared/thoughtCollapse.js'

export type ToolRow = {
  id: string
  name: string
  summary?: string
  state: 'running' | 'waiting' | 'done' | 'error'
  output: string
  startedAt: number
  endedAt?: number
  expanded: boolean
  cancelled?: boolean
  rolledBack?: boolean
}

export type CliHistoryItem =
  | { kind: 'you'; text: string }
  | { kind: 'thought'; thought: unknown }
  | { kind: 'tool'; tool: ToolRow }
  | { kind: 'tool_group'; tools: ToolRow[]; label: string }
  | { kind: 'steps'; steps: unknown }
  | { kind: 'feedback'; feedback: unknown }
  | { kind: 'assistant'; text: string }
  | { kind: 'status'; text: string }

/** Empty 0s “思考” rows are status noise, not a real reasoning block. */
export function isDisplayableThought(th: {
  thinking?: string
  startedAt: number
  endedAt?: number
  now?: number
}): boolean {
  if ((th.thinking || '').trim()) return true
  const t = th.now ?? Date.now()
  const end = th.endedAt ?? t
  return end - th.startedAt >= 800
}

export function withoutNoiseThoughts<T extends CliHistoryItem>(items: T[]): T[] {
  const now = Date.now()
  return items.filter((it) => {
    if (it.kind !== 'thought') return true
    const th = it.thought as {
      thinking?: string
      startedAt: number
      endedAt?: number
    }
    return isDisplayableThought({ ...th, now })
  })
}

export function withCollapsedToolGroups<T extends CliHistoryItem>(items: T[]): T[] {
  const out: T[] = []
  let i = 0
  const src = withoutNoiseThoughts(items)
  while (i < src.length) {
    const it = src[i]!
    if (it.kind !== 'tool') {
      out.push(it)
      i++
      continue
    }
    let j = i
    const chunk: ToolRow[] = []
    while (j < src.length && src[j]?.kind === 'tool') {
      chunk.push((src[j] as { kind: 'tool'; tool: ToolRow }).tool)
      j++
    }
    const steps = chunk.map((t) => ({
      name: t.name,
      path: t.summary,
      input: undefined
    }))
    const groups = groupToolSteps(steps)
    let idx = 0
    for (const g of groups) {
      if (g.kind === 'collapsed') {
        const tools = chunk.slice(idx, idx + g.count)
        idx += g.count
        out.push({
          kind: 'tool_group',
          tools,
          label: g.label
        } as T)
      } else {
        out.push({ kind: 'tool', tool: chunk[idx]! } as T)
        idx++
      }
    }
    i = j
  }
  return out
}

export function toolGroupExpanded(tools: ToolRow[]): boolean {
  return tools.some((t) => t.expanded)
}

export function setToolGroupExpanded(tools: ToolRow[], expanded: boolean): void {
  for (const t of tools) t.expanded = expanded
}
