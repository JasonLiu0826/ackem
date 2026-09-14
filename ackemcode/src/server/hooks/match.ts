import { isAbsolute, join } from 'node:path'
import type { HookConfig, HookMatcherGroup } from './types.js'
import { extractSubject, normalizeToolName } from '../agent/permissionRules.js'

/**
 * CC matchesPattern spirit: empty/* = all; pipe-list exact; else regex.
 * Used for tool names, FileChanged basenames, ConfigChange sources, etc.
 */
export function matcherMatchesQuery(
  matcher: string | undefined,
  query: string
): boolean {
  const m = (matcher ?? '').trim()
  if (!m || m === '*' || m === '.*') return true
  const q = query.trim()
  // Pipe list / simple tokens — allow dots for filenames (.env|.envrc)
  if (m.includes('|') && !m.startsWith('^') && !m.includes('(')) {
    return m
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .some((p) => p === q || normalizeToolName(p) === normalizeToolName(q))
  }
  // Simple exact (no regex metacharacters)
  if (/^[a-zA-Z0-9_./\\:-]+$/.test(m) && !m.includes('*')) {
    return m === q || normalizeToolName(m) === normalizeToolName(q)
  }
  try {
    return new RegExp(m, 'i').test(q) || new RegExp(m, 'i').test(normalizeToolName(q))
  } catch {
    return normalizeToolName(m) === normalizeToolName(q)
  }
}

/** CC matcher: regex or pipe-separated tool names. Empty / missing = match all. */
export function matcherMatchesTool(
  matcher: string | undefined,
  toolName: string
): boolean {
  return matcherMatchesQuery(matcher, toolName)
}

/**
 * CC `if` field — permission rule syntax simplified:
 * - "bash" → tool name
 * - "bash(rm *)" → tool + subject glob
 */
export function ifConditionMatches(
  ifExpr: string | undefined,
  toolName: string,
  toolInput: unknown
): boolean {
  const raw = (ifExpr ?? '').trim()
  if (!raw) return true
  const name = normalizeToolName(toolName)
  const m = raw.match(/^([A-Za-z0-9_]+)\s*(?:\((.*)\))?$/)
  if (!m) {
    return normalizeToolName(raw) === name
  }
  const ruleTool = normalizeToolName(m[1]!)
  if (ruleTool !== name) return false
  const content = (m[2] ?? '').trim()
  if (!content || content === '*') return true
  const subject = extractSubject(name, toolInput)
  return matchSimpleGlob(content, subject)
}

function matchSimpleGlob(pattern: string, subject: string): boolean {
  const p = pattern.trim()
  const s = subject.trim()
  if (p === '*') return true
  if (p.endsWith(' *') || p.endsWith('*')) {
    const prefix = p.replace(/\s*\*$/, '').trimEnd()
    return s === prefix || s.startsWith(prefix + ' ') || s.startsWith(prefix)
  }
  if (p.includes('*')) {
    const esc = p
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
    try {
      return new RegExp(`^${esc}$`, 'i').test(s)
    } catch {
      return s.toLowerCase().includes(p.replace(/\*/g, '').toLowerCase())
    }
  }
  return s === p || s.startsWith(p + ' ')
}

export function selectHooks(
  groups: HookMatcherGroup[] | undefined,
  matchQuery: string | undefined,
  toolInput?: unknown,
  opts?: { applyIfCondition?: boolean; toolNameForIf?: string }
): HookConfig[] {
  if (!groups?.length) return []
  const out: HookConfig[] = []
  const applyIf = opts?.applyIfCondition !== false
  const toolForIf = opts?.toolNameForIf ?? matchQuery
  for (const g of groups) {
    if (matchQuery != null && !matcherMatchesQuery(g.matcher, matchQuery)) {
      continue
    }
    for (const h of g.hooks ?? []) {
      if (
        applyIf &&
        toolForIf != null &&
        !ifConditionMatches(h.if, toolForIf, toolInput)
      ) {
        continue
      }
      out.push(h)
    }
  }
  return out
}

/** Static FileChanged matcher paths (cwd-relative or absolute). */
export function resolveFileChangedMatcherPaths(
  groups: HookMatcherGroup[] | undefined,
  cwd: string
): string[] {
  if (!groups?.length) return []
  const out: string[] = []
  for (const g of groups) {
    if (!g.matcher?.trim()) continue
    for (const name of g.matcher.split('|').map((s) => s.trim())) {
      if (!name) continue
      out.push(isAbsolute(name) ? name : join(cwd, name))
    }
  }
  return [...new Set(out)]
}
