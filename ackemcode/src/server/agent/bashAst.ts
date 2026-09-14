/**
 * R2-BASHAST · Structured shell analysis (Claude Code bashSecurity / treeSitterAnalysis spirit).
 *
 * Ackem-owned, dependency-free structured tokenizer. NOT a full tree-sitter grammar
 * (that would require shipping a wasm binary); instead a quote/substitution/redirect-aware
 * recursive-descent scanner that closes the behavioral gaps a flat regex table misses:
 *   - quote-concatenation obfuscation of the command word (`"r""m" -rf`, `rm -r""f`)
 *   - command/process substitution recursion (`$(…)`, `` `…` ``, `<(…)`)
 *   - redirect target extraction (`> ~/.ssh/authorized_keys`)
 *   - heredoc body (not executed → don't treat as commands; still scan `$()` inside)
 *   - complexity guard (pathological nesting → fail-closed)
 *
 * The simple segmenter in shellSecurity.ts remains the ultra-fallback. Analyzer bugs
 * throw and callers fail-closed to critical.
 */

/** Bounds so a pathological input can't blow up the scanner (contract 8). */
export const MAX_SHELL_INPUT_LEN = 20_000
export const MAX_SUBSTITUTION_DEPTH = 5

export type ShellWord = {
  /** Raw slice as it appeared (with quotes). */
  raw: string
  /** Dequoted literal (quotes that were quoting removed; escapes resolved). */
  literal: string
  /** True if any quote char participated in forming this word. */
  hadQuote: boolean
}

export type Redirect = {
  op: string // > >> >| 2> &> <
  /** Dequoted target path/word, if a filename target follows. */
  target: string | null
}

export type Substitution = {
  kind: 'command' | 'process' | 'backtick'
  /** Inner command text (for recursive analysis). */
  inner: string
}

export type ParsedSegment = {
  /** Words on the command line (command name + args), heredoc/redirect stripped. */
  words: ShellWord[]
  /** Per-word dequoted command line (word boundaries preserved, quotes removed). */
  dequoted: string
  /** Command substitutions found anywhere in the segment. */
  substitutions: Substitution[]
  /** Redirects on this segment. */
  redirects: Redirect[]
  /** Heredoc delimiter if `<<`/`<<-` present. */
  heredocDelim: string | null
  /** True when a heredoc was opened but not properly closed / delimiter malformed. */
  heredocMalformed: boolean
}

function dequote(raw: string): string {
  let out = ''
  let quote: '"' | "'" | '`' | null = null
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (quote === "'") {
      if (ch === "'") quote = null
      else out += ch
      continue
    }
    if (quote === '"' || quote === '`') {
      if (ch === '\\' && i + 1 < raw.length) {
        out += raw[i + 1]
        i++
        continue
      }
      if (ch === quote) quote = null
      else out += ch
      continue
    }
    // unquoted
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '\\' && i + 1 < raw.length) {
      out += raw[i + 1]
      i++
      continue
    }
    out += ch
  }
  return out
}

/**
 * Extract command/process substitutions `$(...)`, `<(...)`, `>(...)`, `` `...` ``
 * (quote-aware, balanced). Returns spans so callers can recurse.
 */
export function extractSubstitutions(command: string): Substitution[] {
  const subs: Substitution[] = []
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < command.length) {
    const ch = command[i]!
    if (quote === "'") {
      if (ch === "'") quote = null
      i++
      continue
    }
    if (quote === '"') {
      // command substitution IS active inside double quotes
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '"') {
        quote = null
        i++
        continue
      }
      if (ch === '$' && command[i + 1] === '(') {
        const { inner, next } = readBalanced(command, i + 2, '(', ')')
        subs.push({ kind: 'command', inner })
        i = next
        continue
      }
      if (ch === '`') {
        const end = command.indexOf('`', i + 1)
        if (end === -1) break
        subs.push({ kind: 'backtick', inner: command.slice(i + 1, end) })
        i = end + 1
        continue
      }
      i++
      continue
    }
    // unquoted
    if (ch === "'" || ch === '"') {
      quote = ch
      i++
      continue
    }
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '$' && command[i + 1] === '(') {
      const { inner, next } = readBalanced(command, i + 2, '(', ')')
      subs.push({ kind: 'command', inner })
      i = next
      continue
    }
    if ((ch === '<' || ch === '>') && command[i + 1] === '(') {
      const { inner, next } = readBalanced(command, i + 2, '(', ')')
      subs.push({ kind: 'process', inner })
      i = next
      continue
    }
    if (ch === '`') {
      const end = command.indexOf('`', i + 1)
      if (end === -1) break
      subs.push({ kind: 'backtick', inner: command.slice(i + 1, end) })
      i = end + 1
      continue
    }
    i++
  }
  return subs
}

function readBalanced(
  s: string,
  start: number,
  open: string,
  close: string
): { inner: string; next: number } {
  let depth = 1
  let i = start
  let quote: '"' | "'" | null = null
  while (i < s.length) {
    const ch = s[i]!
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      i++
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return { inner: s.slice(start, i), next: i + 1 }
    }
    i++
  }
  return { inner: s.slice(start), next: s.length }
}

/**
 * Parse one already-separated segment (no top-level | ; && ||) into a structured
 * view: dequoted words, redirects, substitutions, heredoc.
 */
export function parseSegment(segment: string): ParsedSegment {
  const substitutions = extractSubstitutions(segment)

  // Detect heredoc: `<<` or `<<-` followed by a (optionally quoted) delimiter word.
  let heredocDelim: string | null = null
  let heredocMalformed = false
  const heredocMatch = segment.match(/<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/)
  if (/<<-?/.test(segment)) {
    if (heredocMatch) {
      heredocDelim = heredocMatch[2] ?? null
    } else {
      // `<<` present but no well-formed delimiter → ambiguous
      heredocMalformed = true
    }
  }

  // Cut the heredoc body out of the command portion (body isn't executed).
  let cmdPortion = segment
  if (heredocDelim) {
    const idx = segment.indexOf(heredocMatch![0])
    if (idx >= 0) cmdPortion = segment.slice(0, idx)
  }

  const words: ShellWord[] = []
  const redirects: Redirect[] = []
  let buf = ''
  let bufHadQuote = false
  let quote: '"' | "'" | '`' | null = null
  let i = 0

  const pushWord = () => {
    if (buf.length === 0) return
    words.push({ raw: buf, literal: dequote(buf), hadQuote: bufHadQuote })
    buf = ''
    bufHadQuote = false
  }

  while (i < cmdPortion.length) {
    const ch = cmdPortion[i]!
    if (quote) {
      if (quote !== "'" && ch === '\\' && i + 1 < cmdPortion.length) {
        buf += ch + cmdPortion[i + 1]
        i += 2
        continue
      }
      if (ch === quote) quote = null
      buf += ch
      i++
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      bufHadQuote = true
      buf += ch
      i++
      continue
    }
    if (ch === '\\' && i + 1 < cmdPortion.length) {
      buf += ch + cmdPortion[i + 1]
      i += 2
      continue
    }
    if (ch === ' ' || ch === '\t') {
      pushWord()
      i++
      continue
    }
    // Redirect operators (unquoted)
    const two = cmdPortion.slice(i, i + 2)
    if (two === '>>' || two === '&>') {
      pushWord()
      const { op, target, next } = readRedirect(cmdPortion, i, two)
      redirects.push({ op, target })
      i = next
      continue
    }
    if (
      (ch === '>' || ch === '<') &&
      cmdPortion[i + 1] !== '(' &&
      cmdPortion[i + 1] !== '&'
    ) {
      // simple > or < (skip < of heredoc already handled; process-subst handled elsewhere)
      pushWord()
      const { op, target, next } = readRedirect(cmdPortion, i, ch)
      redirects.push({ op, target })
      i = next
      continue
    }
    // NN> style (2>, 1>>)
    const fdRedir = cmdPortion.slice(i).match(/^(\d)(>>|>)/)
    if (fdRedir) {
      pushWord()
      const op = fdRedir[0]!
      const { target, next } = readRedirectTarget(cmdPortion, i + op.length)
      redirects.push({ op, target })
      i = next
      continue
    }
    buf += ch
    i++
  }
  pushWord()

  const dequoted = words.map((w) => w.literal).join(' ')
  return { words, dequoted, substitutions, redirects, heredocDelim, heredocMalformed }
}

function readRedirect(
  s: string,
  start: number,
  op: string
): { op: string; target: string | null; next: number } {
  const after = start + op.length
  const { target, next } = readRedirectTarget(s, after)
  return { op, target, next }
}

function readRedirectTarget(
  s: string,
  from: number
): { target: string | null; next: number } {
  let i = from
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
  if (i >= s.length) return { target: null, next: i }
  let raw = ''
  let quote: '"' | "'" | null = null
  while (i < s.length) {
    const ch = s[i]!
    if (quote) {
      if (ch === quote) quote = null
      else raw += ch
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      i++
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '|' || ch === ';' || ch === '&') break
    raw += ch
    i++
  }
  return { target: raw.length ? raw : null, next: i }
}
