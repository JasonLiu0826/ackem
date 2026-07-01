export type SemverTriple = [number, number, number]

export function parseSemver(version: string): SemverTriple | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(version.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareSemver(a: string, b: string): number | null {
  const ta = parseSemver(a)
  const tb = parseSemver(b)
  if (!ta || !tb) return null
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] < tb[i] ? -1 : 1
  }
  return 0
}

export function isNewerVersion(remote: string, current: string): boolean {
  const c = compareSemver(remote, current)
  return c !== null && c > 0
}
