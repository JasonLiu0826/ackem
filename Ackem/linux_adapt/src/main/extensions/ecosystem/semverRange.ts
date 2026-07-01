// [ecosystem/semverRange] — 轻量 semver range 匹配（避免额外依赖）

type SemverTriple = [number, number, number]

function parseTriple(v: string): SemverTriple | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function cmp(a: SemverTriple, b: SemverTriple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

function satisfiesComparator(version: SemverTriple, op: string, bound: SemverTriple): boolean {
  const c = cmp(version, bound)
  switch (op) {
    case '':
    case '=':
      return c === 0
    case '>=':
      return c >= 0
    case '<=':
      return c <= 0
    case '>':
      return c > 0
    case '<':
      return c < 0
    default:
      return false
  }
}

/** 支持 `1.0.0`、`^1.0.0`、`>=1.0.0 <2.0.0` 等常见写法 */
export function semverSatisfies(version: string, range: string): boolean {
  const v = parseTriple(version)
  if (!v) return false
  const trimmed = range.trim()
  if (!trimmed) return false

  if (/^\d+\.\d+\.\d+$/.test(trimmed)) {
    return cmp(v, parseTriple(trimmed)!) === 0
  }

  if (trimmed.startsWith('^')) {
    const base = parseTriple(trimmed.slice(1))
    if (!base) return false
    if (base[0] > 0) {
      return cmp(v, base) >= 0 && v[0] === base[0]
    }
    if (base[1] > 0) {
      return cmp(v, base) >= 0 && v[0] === base[0] && v[1] === base[1]
    }
    return cmp(v, base) >= 0 && v[0] === base[0] && v[1] === base[1] && v[2] === base[2]
  }

  if (trimmed.startsWith('~')) {
    const base = parseTriple(trimmed.slice(1))
    if (!base) return false
    return cmp(v, base) >= 0 && v[0] === base[0] && v[1] === base[1]
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  for (const part of parts) {
    const m = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(part)
    if (!m) return false
    const bound = parseTriple(m[2])
    if (!bound) return false
    if (!satisfiesComparator(v, m[1] ?? '=', bound)) return false
  }
  return true
}
