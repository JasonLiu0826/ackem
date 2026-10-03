/**
 * Shell timeouts / output caps — Claude Code BashTool / PowerShellTool numbers.
 */
export const SHELL_DEFAULT_TIMEOUT_MS = 120_000
export const SHELL_MAX_TIMEOUT_MS = 600_000
export const SHELL_MAX_OUTPUT_CHARS = 30_000

export function resolveShellTimeoutMs(input: Record<string, unknown>): number {
  const raw = input.timeout_ms ?? input.timeout
  let ms = SHELL_DEFAULT_TIMEOUT_MS
  if (raw != null && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) ms = Math.floor(n)
  }
  // Env overrides (CC aliases)
  const envDefault = parseInt(process.env.BASH_DEFAULT_TIMEOUT_MS || '', 10)
  const envMax = parseInt(process.env.BASH_MAX_TIMEOUT_MS || '', 10)
  const max = !Number.isNaN(envMax) && envMax > 0 ? envMax : SHELL_MAX_TIMEOUT_MS
  if (!Number.isNaN(envDefault) && envDefault > 0 && raw == null) {
    ms = envDefault
  }
  // Clamp to [1, max]; max floored at default (CC BASH_MAX_TIMEOUT_MS spirit)
  const cappedMax = Math.max(max, SHELL_DEFAULT_TIMEOUT_MS)
  return Math.min(Math.max(1, ms), cappedMax)
}

export function truncateShellOutput(text: string, max = SHELL_MAX_OUTPUT_CHARS): string {
  const cap = (() => {
    const env = parseInt(process.env.BASH_MAX_OUTPUT_LENGTH || '', 10)
    if (!Number.isNaN(env) && env > 0) return Math.min(env, 150_000)
    return max
  })()
  if (text.length <= cap) return text
  const removed = text.length - cap
  return (
    text.slice(0, cap) +
    `\n… [output truncated - ${Math.ceil(removed / 1024)}KB removed]`
  )
}

/** Informational destructive patterns (UI/result warning; does not auto-deny). */
export function destructiveShellWarning(
  command: string,
  shell: 'bash' | 'powershell'
): string | null {
  const c = command
  if (shell === 'powershell') {
    if (
      /\b(Remove-Item|rm|del|rd|rmdir)\b/i.test(c) &&
      /-(Recurse|Force|r|f)\b/i.test(c)
    ) {
      return 'Destructive pattern: recursive/forced Remove-Item'
    }
    if (/\b(Format-Volume|Clear-Disk|Stop-Computer|Restart-Computer)\b/i.test(c)) {
      return 'Destructive pattern: system-altering PowerShell cmdlet'
    }
  }
  if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)/.test(c) || /\brm\s+-rf\b/.test(c)) {
    return 'Destructive pattern: rm -rf'
  }
  if (/\bgit\s+reset\s+--hard\b/.test(c) || /\bgit\s+push\s+.*(--force|-f)\b/.test(c)) {
    return 'Destructive pattern: git force/reset'
  }
  if (/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i.test(c)) {
    return 'Destructive pattern: DROP/TRUNCATE'
  }
  if (/\bkubectl\s+delete\b/.test(c) || /\bterraform\s+destroy\b/.test(c)) {
    return 'Destructive pattern: infra destroy/delete'
  }
  return null
}

/**
 * Exit-code semantics — CC interpretCommandResult spirit (simplified).
 * Returns whether the tool result should be ok:true despite non-zero code.
 */
export function isBenignNonZeroExit(command: string, code: number | null): boolean {
  if (code === 0 || code == null) return true
  if (code !== 1) return false
  const head = command.trim().split(/\s+/)[0]?.replace(/\.exe$/i, '') ?? ''
  // grep/rg: 1 = no matches
  if (head === 'grep' || head === 'rg' || head === 'findstr') return true
  // diff: 1 = differ
  if (head === 'diff' || head === 'Compare-Object') return true
  return false
}
