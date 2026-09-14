/** G-04: extract @paths from user text (not @mcp:). Shared by Runtime + CLI. */

const AT_RE = /@([^\s@]+)/g

export function extractAtPaths(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(AT_RE)) {
    let raw = m[1] ?? ''
    if (!raw || raw.startsWith('mcp:')) continue
    raw = raw.replace(/[.,;:!?。，；：！？、)\]」』]+$/g, '')
    if (raw) out.push(raw)
  }
  return [...new Set(out)]
}
