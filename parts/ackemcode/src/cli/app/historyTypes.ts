/** Shared Ink timeline item types (App + hydrate + collapse). */

export type ToolLine = { id?: string; name: string; path?: string; ok?: boolean; output?: string }
export type ToolState = 'running' | 'waiting' | 'done' | 'error'

export type FoldBlock = {
  id: string
  startedAt: number
  endedAt?: number
  expanded: boolean
  cancelled?: boolean
  rolledBack?: boolean
}

export type Thought = FoldBlock & { thinking: string }
export type Steps = FoldBlock & { tools: ToolLine[]; changed: string[] }
export type Feedback = FoldBlock & { toolName: string; path?: string; ok: boolean; output: string }

export type ToolEntry = FoldBlock & {
  id: string
  name: string
  summary?: string
  state: ToolState
  output: string
  /** D-10: write/edit tool input for truncated diff when expanded. */
  editInput?: unknown
}

export type HistoryItem =
  | { kind: 'you'; text: string }
  | { kind: 'thought'; thought: Thought }
  | { kind: 'tool'; tool: ToolEntry }
  | { kind: 'tool_group'; tools: ToolEntry[]; label: string }
  | { kind: 'steps'; steps: Steps }
  | { kind: 'feedback'; feedback: Feedback }
  | { kind: 'assistant'; text: string }
  | { kind: 'status'; text: string }

export function isFoldable(
  it: HistoryItem
): it is
  | { kind: 'thought'; thought: Thought }
  | { kind: 'tool'; tool: ToolEntry }
  | { kind: 'tool_group'; tools: ToolEntry[]; label: string }
  | { kind: 'steps'; steps: Steps }
  | { kind: 'feedback'; feedback: Feedback } {
  return (
    it.kind === 'thought' ||
    it.kind === 'tool' ||
    it.kind === 'tool_group' ||
    it.kind === 'steps' ||
    it.kind === 'feedback'
  )
}
