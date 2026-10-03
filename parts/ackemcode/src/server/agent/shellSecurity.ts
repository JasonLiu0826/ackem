/**
 * Shell security analysis — Claude Code bashSecurity / powershellSecurity spirit.
 * Ackem-owned lightweight parse + structural checks (NOT a port of Anthropic source).
 *
 * GM-BASH goals:
 * - Catch pipeline / secondary-exec / PS download-exec obfuscations regex tables miss
 * - Fail-closed on analyzer errors (never default-allow)
 *
 * Note: risk level type is local to avoid circular import with dangerousPatterns.
 *
 * R2-BASHAST: structured (quote/substitution/redirect/heredoc-aware) checks layered
 * on top of the flat segmenter — see bashAst.ts.
 */
import {
  MAX_SHELL_INPUT_LEN,
  MAX_SUBSTITUTION_DEPTH,
  extractSubstitutions,
  parseSegment
} from './bashAst.js'

export type ShellKind = 'bash' | 'powershell' | 'unknown'

export type ShellSecurityLevel = 'none' | 'low' | 'high' | 'critical'

export type ShellSecurityHit = {
  level: ShellSecurityLevel
  id: string
  reason: string
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g
const UNICODE_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

/** Normalize for scanning: strip ZWSP, unify newlines/CR, collapse spaces. */
export function normalizeForSecurityScan(command: string): string {
  return command
    .replace(ZERO_WIDTH, '')
    .replace(UNICODE_SPACE, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\\\n/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .trim()
}

/**
 * Quote-aware split on shell separators (| ; && || newline).
 * Lightweight — not a full bash AST. On ambiguity, callers fail-closed.
 */
export function splitShellSegments(command: string): string[] {
  const s = normalizeForSecurityScan(command)
  const out: string[] = []
  let buf = ''
  let quote: '"' | "'" | '`' | null = null
  let i = 0
  while (i < s.length) {
    const ch = s[i]!
    if (quote) {
      if (ch === '\\' && quote !== "'" && i + 1 < s.length) {
        buf += ch + s[i + 1]
        i += 2
        continue
      }
      if (ch === quote) quote = null
      buf += ch
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      buf += ch
      i++
      continue
    }
    if (ch === '&' && s[i + 1] === '&') {
      pushBuf()
      i += 2
      continue
    }
    if (ch === '|' && s[i + 1] === '|') {
      pushBuf()
      i += 2
      continue
    }
    if (ch === '|' || ch === ';' || ch === '\n') {
      pushBuf()
      i++
      continue
    }
    buf += ch
    i++
  }
  pushBuf()
  return out

  function pushBuf() {
    const t = buf.trim()
    if (t) out.push(t)
    buf = ''
  }
}

const DOWNLOAD_HEAD =
  /\b(curl|wget|fetch|iwr|invoke-webrequest|invoke-restmethod|irm)\b/i
const SHELL_EXEC_HEAD =
  /\b((ba)?sh|zsh|fish|dash|pwsh|powershell(\.exe)?|cmd(\.exe)?|iex|invoke-expression)\b/i
const DECODE_HEAD =
  /\b(base64|xxd|openssl\s+enc\b[^\n|]*?-d)\b/i
const SUDO_PREFIX = /^\s*sudo(\s+(-[a-zA-Z]\S*\s+)*)?/i

function stripLeadingSudo(seg: string): string {
  return seg.replace(SUDO_PREFIX, '').trim()
}

function headLooksLike(seg: string, re: RegExp): boolean {
  const s = stripLeadingSudo(seg)
  // env VAR=val cmd …
  const stripped = s.replace(/^(?:[A-Za-z_][\w]*=\S*\s+)+/, '')
  return re.test(stripped)
}

/** Structural remote→shell / decode→shell pipeline hits. */
function checkPipelineRce(segments: string[]): ShellSecurityHit | null {
  for (let i = 0; i < segments.length - 1; i++) {
    const left = segments[i]!
    const right = stripLeadingSudo(segments[i + 1]!)
    const leftDl = headLooksLike(left, DOWNLOAD_HEAD)
    const leftDec = headLooksLike(left, DECODE_HEAD)
    const rightShell = headLooksLike(right, SHELL_EXEC_HEAD)
    if (leftDl && rightShell) {
      return {
        level: 'critical',
        id: 'pipeline_download_shell',
        reason: 'Critical: download/fetch piped (or chained) into a shell'
      }
    }
    if (leftDec && rightShell) {
      return {
        level: 'critical',
        id: 'pipeline_decode_shell',
        reason: 'Critical: decoded payload piped into a shell'
      }
    }
  }
  return null
}

/** bash -c / eval / source with remote or decode payload. */
function checkSecondaryExec(norm: string): ShellSecurityHit | null {
  if (
    /\b((ba)?sh|zsh|fish)\s+-c\b[\s\S]*\b(curl|wget|fetch|base64)\b/i.test(
      norm
    )
  ) {
    return {
      level: 'critical',
      id: 'shell_c_remote_or_decode',
      reason: 'Critical: shell -c with remote fetch or decode payload'
    }
  }
  if (
    /\beval\b[\s\S]*(\$\(|`|\bcurl\b|\bwget\b|\bbase64\b)/i.test(norm) ||
    /\bsource\b[\s\S]*(\$\(|`|\bcurl\b|\bwget\b|\bbase64\b)/i.test(norm)
  ) {
    return {
      level: 'critical',
      id: 'eval_remote_or_decode',
      reason: 'Critical: eval/source of remote or decoded content'
    }
  }
  if (/\b((ba)?sh|zsh)\s+<\s*\(\s*(curl|wget)\b/i.test(norm)) {
    return {
      level: 'critical',
      id: 'process_subst_remote',
      reason: 'Critical: process-substitution of remote script into shell'
    }
  }
  if (/\bxargs\b[\s\S]*\b((ba)?sh|zsh|bash)\b/i.test(norm) && DOWNLOAD_HEAD.test(norm)) {
    return {
      level: 'critical',
      id: 'xargs_shell_remote',
      reason: 'Critical: xargs → shell with remote content in command'
    }
  }
  return null
}

/** PowerShell download-exec and process-spawn forms. */
function checkPowerShellDanger(norm: string): ShellSecurityHit | null {
  // iex (iwr …) / Invoke-Expression (Invoke-WebRequest …)
  if (
    /\b(iex|invoke-expression)\b[\s\S]*\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring|downloadfile|net\.webclient)\b/i.test(
      norm
    ) ||
    /\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b[\s\S]*\b(iex|invoke-expression)\b/i.test(
      norm
    )
  ) {
    return {
      level: 'critical',
      id: 'ps_download_iex',
      reason: 'Critical: PowerShell download + Invoke-Expression'
    }
  }

  if (
    /\b(invoke-wmimethod|iwmi|invoke-cimmethod)\b[\s\S]*\b(win32_process)\b[\s\S]*\b(create)\b/i.test(
      norm
    )
  ) {
    return {
      level: 'critical',
      id: 'ps_wmi_process_create',
      reason: 'Critical: WMI/CIM Win32_Process Create (arbitrary spawn)'
    }
  }

  if (
    /\b(start-process|saps)\b[\s\S]*(-enc|-encodedcommand|\/encodedcommand)\b/i.test(
      norm
    ) ||
    /\bpowershell(\.exe)?\b[\s\S]*(-enc|-encodedcommand|\/encodedcommand)\b/i.test(
      norm
    ) ||
    /\bpwsh(\.exe)?\b[\s\S]*(-enc|-encodedcommand|\/encodedcommand)\b/i.test(
      norm
    )
  ) {
    return {
      level: 'critical',
      id: 'ps_encoded_command',
      reason: 'Critical: PowerShell EncodedCommand / -enc spawn'
    }
  }

  if (
    /\b(invoke-command|icm|start-job|start-threadjob)\b[\s\S]*(-scriptblock|\{)/i.test(
      norm
    )
  ) {
    return {
      level: 'high',
      id: 'ps_scriptblock_exec',
      reason: 'High risk: PowerShell scriptblock execution cmdlet'
    }
  }

  if (/\b(import-module|ipmo|install-module|install-script)\b/i.test(norm)) {
    return {
      level: 'high',
      id: 'ps_module_load',
      reason: 'High risk: PowerShell module/script load (code execution on import)'
    }
  }

  if (/\b(set-alias|sal|new-alias|nal)\b/i.test(norm)) {
    return {
      level: 'high',
      id: 'ps_alias_hijack',
      reason: 'High risk: PowerShell alias mutation'
    }
  }

  // R2 contract 7: arg-gated indirect execution of a variable/expression.
  // `Invoke-Expression $cmd`, `iex $x`, `& $tool`, `. $script`
  if (
    /\b(iex|invoke-expression)\b\s+[$@(]/i.test(norm) ||
    /(^|[\s;|(])[&.]\s+\$[A-Za-z_]/.test(norm)
  ) {
    return {
      level: 'high',
      id: 'ps_indirect_exec',
      reason: 'High risk: PowerShell indirect execution of a variable/expression'
    }
  }

  return null
}

/** Local sensitive redirect targets (subset; avoids circular dep on dangerousPatterns). */
const SENSITIVE_REDIRECT_TARGETS: readonly { re: RegExp; reason: string }[] = [
  { re: /(^|[\\/])\.ssh([\\/]|$)/i, reason: '.ssh' },
  { re: /authorized_keys$/i, reason: 'authorized_keys' },
  { re: /(^|[\\/])\.(bashrc|zshrc|bash_profile|profile|zprofile)$/i, reason: 'shell rc' },
  { re: /(^|[\\/])\.git([\\/]hooks([\\/]|$)|[\\/]config$)/i, reason: '.git hooks/config' },
  { re: /^(\/etc\/|\/etc$)/i, reason: '/etc' },
  { re: /(^|[\\/])crontab$|(^|[\\/])cron\.(d|daily|hourly)([\\/]|$)/i, reason: 'cron' },
  { re: /(^|[\\/])\.(aws|gnupg|kube)([\\/]|$)/i, reason: 'credential dir' },
  { re: /(^|[\\/])sudoers(\.d)?([\\/]|$)?$/i, reason: 'sudoers' }
]

const WRITE_REDIRECT_OP = /^(&?>>?|\d*>>?|>\|)$/

/** R2 contract 4: writing (via redirect) into a sensitive target → critical. */
function checkRedirectTargets(segments: string[]): ShellSecurityHit | null {
  for (const seg of segments) {
    const parsed = parseSegment(seg)
    for (const r of parsed.redirects) {
      if (!r.target) continue
      if (!WRITE_REDIRECT_OP.test(r.op)) continue // only write/append redirects
      for (const s of SENSITIVE_REDIRECT_TARGETS) {
        if (s.re.test(r.target)) {
          return {
            level: 'critical',
            id: 'redirect_sensitive_target',
            reason: `Critical: redirect writes into sensitive target (${s.reason}: ${r.target})`
          }
        }
      }
    }
  }
  return null
}

/** R2 contract 5: malformed heredoc delimiter → ambiguous parse, ask. */
function checkHeredoc(segments: string[]): ShellSecurityHit | null {
  for (const seg of segments) {
    const parsed = parseSegment(seg)
    if (parsed.heredocMalformed) {
      return {
        level: 'high',
        id: 'heredoc_malformed',
        reason: 'High risk: heredoc with malformed/ambiguous delimiter'
      }
    }
  }
  return null
}

/** Misparsing / injection ambiguity → ask/deny, never allow. */
function checkMisparsing(command: string, norm: string): ShellSecurityHit | null {
  // Bare CR outside quotes can diverge between parsers (CC carriage-return finding spirit)
  if (/\r/.test(command) && !/^[^'"]*'[^']*'$/.test(command.trim())) {
    // Only flag when combined with separators / download / shell tokens
    if (
      /[|;]/.test(norm) ||
      DOWNLOAD_HEAD.test(norm) ||
      SHELL_EXEC_HEAD.test(norm)
    ) {
      return {
        level: 'critical',
        id: 'cr_misparse',
        reason: 'Critical: carriage return with shell separators (misparse risk)'
      }
    }
  }

  // Unbalanced quotes + command separator
  let sq = 0
  let dq = 0
  let bt = 0
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (ch === '\\' && i + 1 < command.length) {
      i++
      continue
    }
    if (ch === "'") sq++
    else if (ch === '"') dq++
    else if (ch === '`') bt++
  }
  const unbalanced = sq % 2 === 1 || dq % 2 === 1
  if (unbalanced && /[|;]|\b(curl|wget|iex|eval)\b/i.test(norm)) {
    return {
      level: 'high',
      id: 'unbalanced_quote_injection',
      reason: 'High risk: unbalanced quotes with separators/download (injection ambiguity)'
    }
  }
  if (bt % 2 === 1 && DOWNLOAD_HEAD.test(norm)) {
    return {
      level: 'high',
      id: 'unbalanced_backtick',
      reason: 'High risk: unbalanced backticks with download tokens'
    }
  }

  // IFS=/ path-split games
  if (/\bIFS\s*=/.test(norm) && /[|;]|\beval\b|\bsource\b/.test(norm)) {
    return {
      level: 'high',
      id: 'ifs_injection',
      reason: 'High risk: IFS mutation with command chaining'
    }
  }

  return null
}

/**
 * Analyze a shell command for structural dangers.
 * Throws on unexpected internal errors — callers must fail-closed.
 */
export function analyzeShellSecurity(
  command: string,
  _shell: ShellKind = 'unknown',
  depth = 0
): ShellSecurityHit | null {
  if (typeof command !== 'string') {
    throw new TypeError('analyzeShellSecurity: command must be a string')
  }
  // R2 contract 8: complexity guard — pathological input → fail-closed (throw).
  if (command.length > MAX_SHELL_INPUT_LEN) {
    throw new RangeError(
      `analyzeShellSecurity: command exceeds ${MAX_SHELL_INPUT_LEN} chars (fail-closed)`
    )
  }
  const raw = command
  const norm = normalizeForSecurityScan(raw)
  if (!norm) return null

  const segments = splitShellSegments(raw)

  // R2 contract 2: re-run structural detectors on the per-word DEQUOTED form so
  // quote-concatenation obfuscation (`"c""url" … | sh`) can't slip past.
  const dequotedSegments = segments.map((s) => parseSegment(s).dequoted).filter(Boolean)
  const quotesInvolved = dequotedSegments.some(
    (d, i) => d !== normalizeForSecurityScan(segments[i] ?? '')
  )
  const dequotedNorm = dequotedSegments.join(' ; ')

  const checks: Array<() => ShellSecurityHit | null> = [
    () => checkPipelineRce(segments),
    () => checkSecondaryExec(norm),
    () => checkPowerShellDanger(norm),
    () => checkRedirectTargets(segments),
    () => checkHeredoc(segments),
    () => checkMisparsing(raw, norm)
  ]
  if (quotesInvolved) {
    checks.push(
      () => checkPipelineRce(dequotedSegments),
      () => checkSecondaryExec(dequotedNorm),
      () => checkPowerShellDanger(dequotedNorm)
    )
  }

  let best: ShellSecurityHit | null = null
  for (const fn of checks) {
    const hit = fn()
    if (!hit) continue
    if (!best || rank(hit.level) > rank(best.level)) best = hit
    if (best.level === 'critical') return best
  }

  // R2 contract 3: recurse into command/process substitutions ($(…), `…`, <(…)).
  if (depth < MAX_SUBSTITUTION_DEPTH) {
    for (const sub of extractSubstitutions(raw)) {
      const innerHit = analyzeShellSecurity(sub.inner, _shell, depth + 1)
      if (!innerHit) continue
      const promoted: ShellSecurityHit = {
        level: innerHit.level,
        id: `subst_${innerHit.id}`,
        reason: `Critical inside ${sub.kind} substitution → ${innerHit.reason}`
      }
      if (!best || rank(promoted.level) > rank(best.level)) best = promoted
      if (best.level === 'critical') return best
    }
  } else if (extractSubstitutions(raw).length > 0) {
    // Substitutions still present past the nesting bound → ambiguous, fail-closed.
    throw new RangeError('analyzeShellSecurity: substitution nesting too deep (fail-closed)')
  }

  return best
}

function rank(level: ShellSecurityLevel): number {
  switch (level) {
    case 'critical':
      return 3
    case 'high':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

/**
 * Safe wrapper: never throws to callers that want a classification.
 * Analyzer bugs → critical (fail-closed).
 */
export function classifyShellSecurity(
  command: string,
  shell: ShellKind = 'unknown'
): ShellSecurityHit {
  try {
    const hit = analyzeShellSecurity(command, shell)
    if (hit) return hit
    return {
      level: 'none',
      id: 'clean',
      reason: 'no structural shell security hit'
    }
  } catch (e) {
    return {
      level: 'critical',
      id: 'analyzer_fail_closed',
      reason: `Shell security analyzer failed (fail-closed): ${
        e instanceof Error ? e.message : String(e)
      }`
    }
  }
}
