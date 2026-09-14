export type Frontmatter = Record<string, string>

export function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) {
    return { frontmatter: {}, body: text }
  }
  const end = text.indexOf('\n---', 3)
  if (end === -1) {
    return { frontmatter: {}, body: text }
  }
  const yamlBlock = text.slice(3, end).replace(/^\r?\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const frontmatter: Frontmatter = {}
  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1]!
    let value = m[2] ?? ''
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    frontmatter[key] = value
  }
  return { frontmatter, body }
}

export function asBool(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value === '') return defaultValue
  const v = value.trim().toLowerCase()
  if (['true', 'yes', '1', 'on'].includes(v)) return true
  if (['false', 'no', '0', 'off'].includes(v)) return false
  return defaultValue
}

/** Minimal $ARGUMENTS / $0 substitution (Claude Code compatible subset). */
export function substituteArguments(content: string, args: string): string {
  const parts = args.trim() ? args.trim().split(/\s+/) : []
  let out = content
  out = out.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, i: string) => parts[Number(i)] ?? '')
  out = out.replace(/\$(\d+)\b/g, (_, i: string) => parts[Number(i)] ?? '')
  out = out.replaceAll('$ARGUMENTS', args)
  return out
}
