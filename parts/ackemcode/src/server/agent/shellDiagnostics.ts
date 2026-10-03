/**
 * R2 — parse test/lint/build output for passive reinjection (CC diagnostics spirit).
 */
const ERROR_LINE =
  /(?:^|\n)(.*(?:error TS\d+|ERROR|Error:|FAIL|AssertionError|✕|×|failed|eslint|SyntaxError).*)/gi

const RUN_HINTS =
  /\b(npm test|pnpm test|yarn test|vitest|jest|pytest|eslint|tsc\b|cargo test|go test)\b/i

export function parseShellDiagnostics(
  toolName: string,
  command: string,
  output: string,
  maxLines = 24
): string | null {
  if (toolName !== 'bash' && toolName !== 'powershell') return null
  if (!output.trim()) return null
  const looksLikeTestRun =
    RUN_HINTS.test(command) ||
    RUN_HINTS.test(output.slice(0, 500)) ||
    /\b\d+\s+(failed|passing)\b/i.test(output)
  if (!looksLikeTestRun && !/\berror TS\d+/i.test(output)) return null

  const lines = output.split(/\r?\n/)
  const hits: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (
      /error TS\d+/i.test(t) ||
      /\bFAIL\b/.test(t) ||
      /AssertionError/i.test(t) ||
      /✕|×/.test(t) ||
      /\berror\b/i.test(t) ||
      /eslint/i.test(t)
    ) {
      hits.push(t)
    }
    if (hits.length >= maxLines) break
  }

  if (!hits.length) {
    ERROR_LINE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ERROR_LINE.exec(output)) && hits.length < maxLines) {
      const t = m[1]?.trim()
      if (t) hits.push(t)
    }
  }

  if (!hits.length) return null
  return (
    '[command_diagnostics] Test/lint/build output highlights (fix before claiming done):\n' +
    hits.map((h) => `- ${h}`).join('\n')
  )
}
