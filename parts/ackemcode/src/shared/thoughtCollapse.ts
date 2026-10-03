/**
 * G-02 — collapse consecutive read/search tool lines for Thought UI (display only).
 * CC collapseReadSearch spirit; does not mutate SSE or model messages.
 */

export type ThoughtToolLine = {
  name: string
  path?: string
  input?: unknown
}

export type ThoughtToolGroup =
  | {
      kind: 'collapsed'
      count: number
      label: string
      steps: ThoughtToolLine[]
    }
  | { kind: 'single'; step: ThoughtToolLine }

const READ_SEARCH_TOOLS =
  /^(read_file|read|grep|glob|list_dir|list|web_search)$/i

const WRITE_BREAK_TOOLS = new Set([
  'write_file',
  'search_replace',
  'notebook_edit',
  'bash',
  'powershell'
])

export function pathFromToolInput(
  name: string,
  input?: unknown
): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const o = input as Record<string, unknown>
  if (typeof o.path === 'string') return o.path
  if (typeof o.file_path === 'string') return o.file_path
  if (typeof o.pattern === 'string') return `${name}:${o.pattern}`
  if (typeof o.url === 'string') return o.url
  return undefined
}

function isReadSearchTool(name: string): boolean {
  return READ_SEARCH_TOOLS.test(name.trim())
}

/** Bash/powershell that mutates disk breaks a read/search run (G-02). */
function breaksReadSearchGroup(name: string, input?: unknown): boolean {
  const n = name.trim().toLowerCase()
  if (n === 'write_file' || n === 'search_replace' || n === 'notebook_edit') {
    return true
  }
  if (n === 'bash' || n === 'powershell') {
    if (!input || typeof input !== 'object') return true
    const cmd = String((input as Record<string, unknown>).command ?? '')
    if (!cmd.trim()) return false
    const lower = cmd.toLowerCase()
    if (
      /\b(rm|mv|cp|touch|mkdir|tee|sed\s+-i|git\s+(commit|push|merge|rebase|checkout\s+-f))\b/.test(
        lower
      )
    ) {
      return true
    }
    if (/>|>>/.test(cmd)) return true
    return false
  }
  if (WRITE_BREAK_TOOLS.has(n)) return true
  return false
}

function collapsedLabel(steps: ThoughtToolLine[]): string {
  const paths = steps
    .map((s) => s.path ?? pathFromToolInput(s.name, s.input))
    .filter((p): p is string => Boolean(p))
  const shown = paths.slice(0, 3)
  const extra = paths.length > 3 ? ', …' : ''
  return `read/grep ×${steps.length}   ${shown.join(', ')}${extra}`
}

/**
 * Group consecutive read/search tools; flush on write/bash breaks.
 */
export function groupToolSteps<T extends ThoughtToolLine>(
  steps: T[]
): Array<
  | { kind: 'collapsed'; count: number; label: string; steps: T[] }
  | { kind: 'single'; step: T }
> {
  const out: Array<
    | { kind: 'collapsed'; count: number; label: string; steps: T[] }
    | { kind: 'single'; step: T }
  > = []
  let buf: T[] = []

  const flush = () => {
    if (!buf.length) return
    if (buf.length === 1) {
      out.push({ kind: 'single', step: buf[0]! })
    } else {
      out.push({
        kind: 'collapsed',
        count: buf.length,
        label: collapsedLabel(buf),
        steps: [...buf]
      })
    }
    buf = []
  }

  for (const step of steps) {
    if (isReadSearchTool(step.name)) {
      buf.push({
        ...step,
        path: step.path ?? pathFromToolInput(step.name, step.input)
      })
      continue
    }
    if (breaksReadSearchGroup(step.name, step.input)) {
      flush()
      out.push({
        kind: 'single',
        step: {
          ...step,
          path: step.path ?? pathFromToolInput(step.name, step.input)
        }
      })
      continue
    }
    flush()
    out.push({
      kind: 'single',
      step: {
        ...step,
        path: step.path ?? pathFromToolInput(step.name, step.input)
      }
    })
  }
  flush()
  return out
}

export function groupThoughtToolLines(
  steps: ThoughtToolLine[]
): ThoughtToolGroup[] {
  return groupToolSteps(steps).map((g) =>
    g.kind === 'collapsed'
      ? {
          kind: 'collapsed' as const,
          count: g.count,
          label: g.label,
          steps: g.steps
        }
      : { kind: 'single' as const, step: g.step }
  )
}

/** Flat rows for Ink CLI (legacy collapseReadTools shape). */
export function collapseReadToolsForCli(
  steps: ThoughtToolLine[]
): Array<{ label: string; last: boolean }> {
  const groups = groupThoughtToolLines(steps)
  const rows = groups.map((g) => {
    if (g.kind === 'collapsed') {
      return { label: `  · ${g.label}`, last: false }
    }
    const s = g.step
    return {
      label: `  · ${s.name}   ${s.path ?? ''}`,
      last: false
    }
  })
  if (rows.length) rows[rows.length - 1]!.last = true
  return rows
}
