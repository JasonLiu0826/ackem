import { normalize, relative } from 'node:path'

/** Aligned with docs/memory-format.md §6 — posix-style relative paths from data root.
 *  Structured L4：`memory/facts/`、`memory/tree/` 均在 `memory/` 前缀下。 */
export const ALLOWED_WRITE_PREFIXES = [
  'memory/',
  'preferences/',
  'portrait/',
  'diary/',
  'companion/',
  'staging/'
] as const

const DISALLOWED_PREFIXES = ['imports/', 'packs/', '_derived/'] as const

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Returns normalized relative path like `memory/foo.md` or null if unsafe */
export function sanitizeRelativeWritePath(input: string): string | null {
  const trimmed = input.trim().replace(/^[/\\]+/, '')
  if (!trimmed || trimmed.includes('..')) return null
  const posix = toPosix(trimmed)
  const norm = normalize(posix).replace(/\\/g, '/')
  if (norm.startsWith('..') || relative('.', norm).startsWith('..')) return null
  for (const d of DISALLOWED_PREFIXES) {
    if (norm === d.slice(0, -1) || norm.startsWith(d)) return null
  }
  const ok = ALLOWED_WRITE_PREFIXES.some((pre) => norm === pre.slice(0, -1) || norm.startsWith(pre))
  return ok ? norm : null
}

export function assertReadableUnderDataRoot(dataRoot: string, rel: string): string | null {
  const trimmed = rel.trim().replace(/^[/\\]+/, '')
  if (!trimmed || trimmed.includes('..')) return null
  const posix = toPosix(trimmed)
  if (posix.startsWith('_derived/')) return posix
  const allowedReadPrefixes = [
    'memory/',
    'preferences/',
    'portrait/',
    'diary/',
    'companion/',
    'staging/',
    'imports/',
    'packs/',
    'README.md'
  ]
  const hit =
    posix === 'README.md' ||
    allowedReadPrefixes.some((p) => posix === p.slice(0, -1) || posix.startsWith(p))
  return hit ? posix : null
}
