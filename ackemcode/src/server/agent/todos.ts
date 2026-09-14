export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export type TodoItem = {
  content: string
  status: TodoStatus
  /** Present continuous form shown while working, e.g. "Running tests" */
  activeForm: string
}

export function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return []
  const out: TodoItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const content = String(o.content ?? '').trim()
    const activeForm = String(o.activeForm ?? o.active_form ?? content).trim()
    const statusRaw = String(o.status ?? 'pending')
    const status: TodoStatus =
      statusRaw === 'in_progress' || statusRaw === 'completed' || statusRaw === 'pending'
        ? statusRaw
        : 'pending'
    if (!content) continue
    out.push({ content, status, activeForm: activeForm || content })
  }
  return out
}

/** CC behavior: if every item is completed, clear the list. */
export function applyTodoWrite(newTodos: TodoItem[]): TodoItem[] {
  const allDone = newTodos.length > 0 && newTodos.every((t) => t.status === 'completed')
  return allDone ? [] : newTodos
}

export function formatTodos(todos: TodoItem[]): string {
  if (!todos.length) return '(empty todo list)'
  return todos
    .map((t, i) => {
      const mark =
        t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'
      return `${i + 1}. ${mark} ${t.content} (${t.status}${t.status === 'in_progress' ? ` · ${t.activeForm}` : ''})`
    })
    .join('\n')
}
