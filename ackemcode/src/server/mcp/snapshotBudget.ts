/**
 * Soft-cap Playwright / browser MCP snapshots so a11y trees do not blow the window.
 * Prefer keeping lines that still contain [ref=…] so the model can click.
 */
export function playwrightSnapshotCharBudget(
  env: NodeJS.ProcessEnv = process.env
): number {
  const n = Number(env.ACKEM_PLAYWRIGHT_SNAPSHOT_CHARS)
  if (Number.isFinite(n) && n >= 2000) return Math.floor(n)
  return 20_000
}

export function isPlaywrightMcpToolName(name: string): boolean {
  return /^mcp__playwright(-edge)?__/i.test(name)
}

export function truncatePlaywrightSnapshot(
  text: string,
  maxChars = playwrightSnapshotCharBudget()
): string {
  if (text.length <= maxChars) return text
  const keepRefBudget = Math.floor(maxChars * 0.75)
  const lines = text.split(/\r?\n/)
  const refLines: string[] = []
  const other: string[] = []
  for (const line of lines) {
    if (/\[ref=/i.test(line)) refLines.push(line)
    else other.push(line)
  }
  let out = refLines.join('\n')
  if (out.length > keepRefBudget) {
    out = `${out.slice(0, keepRefBudget)}\n…[truncated refs]`
  }
  const remain = maxChars - out.length - 80
  if (remain > 200 && other.length) {
    const extra = other.join('\n')
    out +=
      '\n' +
      (extra.length > remain
        ? extra.slice(0, remain) + '\n…[truncated]'
        : extra)
  }
  return `${out}\n\n[snapshot truncated — tree incomplete; call snapshot again before using old refs]`
}
