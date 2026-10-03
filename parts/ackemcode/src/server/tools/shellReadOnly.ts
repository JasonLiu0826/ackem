/**
 * Shell read-only classifier (Claude Code BashTool.isReadOnly spirit).
 * Self-implemented allow/deny heuristics — does NOT copy Anthropic source.
 */

const WRITE_REDIRECT = /(^|[^0-9])>{1,2}\s*|<<|\btee\b/i
const DANGEROUS_TOKEN =
  /\b(rm|rmi|del|erase|move|mv|cp|copy|mkdir|md|rd|rmdir|touch|chmod|chown|kill|pkill|remove-item|ri\b|npm\s+i(nstall)?|pnpm\s+i|yarn\s+add|pip\s+install|git\s+(add|commit|push|pull|merge|rebase|reset|checkout|clean|stash|tag\s+-d)|docker\s+(rm|rmi|run|exec|build)|curl\s+.*\s-o\b|wget\s+)/i

/** Base commands treated as read-oriented when args look safe */
const READONLY_HEADS = new Set([
  'ls',
  'dir',
  'pwd',
  'cd', // only when compounded carefully — we reject cd+write elsewhere
  'cat',
  'type',
  'get-content',
  'gc',
  'head',
  'tail',
  'wc',
  'file',
  'stat',
  'which',
  'where',
  'where.exe',
  'echo',
  'printf',
  'true',
  'false',
  'test',
  'grep',
  'rg',
  'findstr',
  'find',
  'fd',
  'fdfind',
  'git',
  'gh',
  'hostname',
  'uname',
  'whoami',
  'date',
  'env',
  'printenv',
  'set', // powershell get; bare `set` on cmd is env list — still treat cautiously below
  'get-childitem',
  'gci',
  'get-location',
  'gl',
  'get-process',
  'gps',
  'select-string',
  'measure-object',
  'get-filehash',
  'resolve-path',
  'test-path',
  'get-item',
  'gi',
  'get-date',
  'write-output', // prints only
  'out-string',
  'convertto-json',
  'format-list',
  'format-table',
  'sort-object',
  'select-object',
  'where-object',
  'foreach-object'
])

const GIT_READONLY_SUB = new Set([
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'tag',
  'remote',
  'rev-parse',
  'rev-list',
  'describe',
  'ls-files',
  'ls-tree',
  'cat-file',
  'blame',
  'stash', // list only — `stash` alone lists; `stash push` denied via DANGEROUS or sub check
  'config', // read: git config --get; writing config denied if has no --get/--list
  'help',
  'version'
])

function splitPipeline(command: string): string[] {
  // Split on | ; && || but keep simple — reject complex if unsure
  return command
    .split(/(?:&&|\|\||;|\n)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function firstTokens(segment: string): string[] {
  // Strip leading env assignments FOO=bar
  let s = segment.trim()
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/.test(s)) {
    s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/, '')
  }
  const parts: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    parts.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return parts
}

function isGitReadOnly(args: string[]): boolean {
  if (args[0]?.toLowerCase() !== 'git') return false
  const sub = (args[1] || '').toLowerCase()
  if (!sub || sub.startsWith('-')) {
    // git --version etc.
    return args.some((a) => a === '--version' || a === '--help' || a === '-h')
  }
  if (!GIT_READONLY_SUB.has(sub)) return false
  if (sub === 'branch' && args.some((a) => /^-d$/i.test(a) || /^-D$/.test(a) || a === '--delete')) {
    return false
  }
  if (sub === 'stash' && args.some((a) => /^(push|pop|apply|drop|clear|create|store)$/i.test(a))) {
    return false
  }
  if (sub === 'config') {
    const joined = args.join(' ')
    if (/\s(--get|--list|-l|--get-regexp)\b/i.test(joined)) return true
    // bare `git config user.name` without --get is a write in git
    if (args.length <= 2) return true // git config → help-ish
    return false
  }
  if (sub === 'tag' && args.some((a) => a === '-d' || a === '--delete' || a === '-a' || a === '-m')) {
    return false
  }
  return true
}

function isSegmentReadOnly(segment: string, shell: 'bash' | 'powershell'): boolean {
  if (!segment.trim()) return true
  if (WRITE_REDIRECT.test(segment)) return false
  if (DANGEROUS_TOKEN.test(segment)) return false
  // pipes: each side must be readonly
  const pipeParts = segment.split('|').map((p) => p.trim()).filter(Boolean)
  if (pipeParts.length > 1) {
    return pipeParts.every((p) => isSegmentReadOnly(p, shell))
  }

  const tokens = firstTokens(segment)
  if (!tokens.length) return false
  let head = tokens[0]!.toLowerCase()
  // powershell call operator
  if (head === '&' && tokens[1]) head = tokens[1]!.toLowerCase()
  // strip path prefixes
  head = head.replace(/^.*[/\\]/, '').replace(/\.exe$/i, '')

  if (head === 'git') return isGitReadOnly(tokens)

  if (!READONLY_HEADS.has(head)) return false

  // find with -exec / -delete is dangerous
  if (head === 'find' && tokens.some((t) => t === '-delete' || t === '-exec' || t === '-execdir')) {
    return false
  }
  return true
}

/**
 * Return true if the entire command is considered read-only (safe to concurrency-batch).
 * On parse / doubt → false (conservative, matches CC throw→unsafe).
 */
export function isShellCommandReadOnly(
  command: string,
  shell: 'bash' | 'powershell' = 'bash'
): boolean {
  try {
    const cmd = String(command || '').trim()
    if (!cmd) return false
    if (cmd.length > 8_000) return false
    const segments = splitPipeline(cmd)
    if (!segments.length) return false
    // Reject cd combined with anything that might write in same chain already split;
    // alone `cd` is ok for bash read-only exploration in CC spirit when not writing.
    return segments.every((seg) => isSegmentReadOnly(seg, shell))
  } catch {
    return false
  }
}
