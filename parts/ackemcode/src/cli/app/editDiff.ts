/** D-10 — truncated unified diff for Thought/tool expand (matches permission box). */
export function formatMiniDiff(input: unknown): { lines: string[]; extra: number } {
  if (!input || typeof input !== 'object') return { lines: [], extra: 0 }
  const o = input as Record<string, unknown>
  const file =
    typeof o.path === 'string'
      ? o.path
      : typeof o.file_path === 'string'
        ? o.file_path
        : typeof o.filePath === 'string'
          ? o.filePath
          : ''
  const oldS =
    typeof o.old_string === 'string'
      ? o.old_string
      : typeof o.oldString === 'string'
        ? o.oldString
        : ''
  const newS =
    typeof o.new_string === 'string'
      ? o.new_string
      : typeof o.newString === 'string'
        ? o.newString
        : typeof o.contents === 'string'
          ? o.contents
          : typeof o.content === 'string'
            ? o.content
            : ''
  if (!oldS && !newS && !file) return { lines: [], extra: 0 }
  const raw: string[] = []
  if (file) raw.push(file)
  if (oldS) raw.push(...oldS.split('\n').map((l) => `-${l}`))
  if (newS) raw.push(...newS.split('\n').map((l) => `+${l}`))
  return { lines: raw.slice(0, 12), extra: Math.max(0, raw.length - 12) }
}

export function isEditTool(name: string): boolean {
  const n = name.toLowerCase().replace(/^mcp__[^_]+__/, '')
  return (
    n === 'write_file' ||
    n === 'search_replace' ||
    n === 'edit_file' ||
    n === 'notebook_edit' ||
    n.includes('write') ||
    n.includes('edit')
  )
}
