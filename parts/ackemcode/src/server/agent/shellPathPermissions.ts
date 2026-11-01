/**
 * Shell path permission — CC BashTool/pathValidation + PowerShellTool/pathValidation spirit.
 * Lightweight extractors (no full PS AST); validates against working dirs + dangerous removal.
 */
import path from 'node:path'
import {
  expandPath,
  pathInAllowedWorkingPaths
} from '../tools/files/pathUtils.js'
import { isDangerousRemovalPath } from './pathValidation.js'
import { splitShellSegments } from './shellSecurity.js'
import { parseSegment } from './bashAst.js'

export type ShellPathPermissionResult = {
  allowed: boolean
  /** ask | deny */
  behavior: 'allow' | 'ask' | 'deny'
  reason: string
}

const PS_WRITE_CMDLETS =
  /\b(Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|New-Item|Remove-Item|Rename-Item|Clear-Content|Expand-Archive|Invoke-WebRequest|Invoke-RestMethod|Tee-Object|Export-Csv|Export-Clixml|Set-Clipboard|Out-String|Start-Transcript|ii|start-process)\b/i

const BASH_WRITE_HINT =
  /\b(rm|rmdir|mv|cp|mkdir|touch|tee|install|dd|truncate|shred)\b|>>?|sed\s+-i/i

const PS_PATH_ARG =
  /-(?:Path|LiteralPath|OutFile|Destination|FilePath|Include|Exclude|Filter)\s+(?:'([^']*)'|"([^"]*)"|([^\s|;&`]+))/gi

const PS_OUTFILE_PIPE =
  /\|\s*Out-File\s+(?:-FilePath\s+)?(?:'([^']*)'|"([^"]*)"|([^\s|;&`]+))/gi

const BASH_REDIRECT =
  /(?:^|[\s|])(?:\d*)>>?\s*(?:'([^']*)'|"([^"]*)"|([^\s|;&`]+))/g

const UNC_OR_URL = /^(https?:|ftp:|\?\?\\|\\\\)/i

function unquoteToken(raw: string): string {
  const t = raw.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

function pushPath(out: Set<string>, raw: string | undefined): void {
  if (!raw) return
  const p = unquoteToken(raw).trim()
  if (!p || p === '&' || p === '|' || p.startsWith('-')) return
  if (UNC_OR_URL.test(p)) return
  if (p.includes('*') || p.includes('?') || p.includes('[')) return
  out.add(p)
}

function extractPathsFromSegment(
  segment: string,
  shell: 'bash' | 'powershell'
): string[] {
  const found = new Set<string>()
  const seg = segment.trim()
  if (!seg) return []

  if (shell === 'powershell') {
    let m: RegExpExecArray | null
    PS_PATH_ARG.lastIndex = 0
    while ((m = PS_PATH_ARG.exec(seg)) !== null) {
      pushPath(found, m[1] ?? m[2] ?? m[3])
    }
    PS_OUTFILE_PIPE.lastIndex = 0
    while ((m = PS_OUTFILE_PIPE.exec(seg)) !== null) {
      pushPath(found, m[1] ?? m[2] ?? m[3])
    }
    const posContent =
      /\b(?:Get-Content|Set-Content|Add-Content|Test-Path)\s+(?:'([^']*)'|"([^"]*)"|([^\s|;&`]+))/gi
    while ((m = posContent.exec(seg)) !== null) {
      pushPath(found, m[1] ?? m[2] ?? m[3])
    }
    const posCopy =
      /\b(?:Copy-Item|Move-Item|Remove-Item|Rename-Item|New-Item|Tee-Object)\s+(?:'([^']*)'|"([^"]*)"|([^\s|;&`]+))/gi
    while ((m = posCopy.exec(seg)) !== null) {
      pushPath(found, m[1] ?? m[2] ?? m[3])
    }
    const tee =
      /\bTee-Object\s+(?:-FilePath\s+)?(?:'([^']*)'|"([^"]*)"|([^\s|;&`]+))/gi
    while ((m = tee.exec(seg)) !== null) {
      pushPath(found, m[1] ?? m[2] ?? m[3])
    }
    const ioWrite =
      /\[(?:System\.)?IO\.File\]::WriteAll(?:Text|Bytes|Lines)\(\s*(?:'([^']*)'|"([^"]*)"|([^\s,)]+))/gi
    while ((m = ioWrite.exec(seg)) !== null) {
      pushPath(found, m[1] ?? m[2] ?? m[3])
    }
  }

  BASH_REDIRECT.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BASH_REDIRECT.exec(seg)) !== null) {
    pushPath(found, m[1] ?? m[2] ?? m[3])
  }

  if (shell === 'bash') {
    const pathy = new Set([
      'rm',
      'rmdir',
      'cp',
      'mv',
      'touch',
      'mkdir',
      'cat',
      'head',
      'tail',
      'less',
      'more',
      'tee',
      'install',
      'sed',
      'python',
      'python3',
      'node'
    ])
    try {
      const parsed = parseSegment(seg)
      const head = parsed.words[0]?.literal.replace(/\.exe$/i, '') ?? ''
      if (pathy.has(head) || head === 'open') {
        for (const w of parsed.words.slice(1)) {
          if (w.literal.startsWith('-')) continue
          pushPath(found, w.literal)
        }
      }
      for (const r of parsed.redirects) {
        if (r.target) pushPath(found, r.target)
      }
    } catch {
      const tokens = seg.split(/\s+/).filter(Boolean)
      const head = tokens[0]?.replace(/\.exe$/i, '') ?? ''
      if (pathy.has(head) || head === 'open') {
        for (const t of tokens.slice(1)) {
          if (t.startsWith('-')) continue
          pushPath(found, t)
        }
      }
    }
  }

  return [...found]
}

function segmentCreatesLink(segment: string): boolean {
  return /\bNew-Item\b[\s\S]*-(ItemType\s+)?(SymbolicLink|Junction|HardLink)\b/i.test(
    segment
  )
}

function segmentIsWriteLike(
  segment: string,
  shell: 'bash' | 'powershell'
): boolean {
  if (shell === 'powershell') return PS_WRITE_CMDLETS.test(segment)
  return BASH_WRITE_HINT.test(segment)
}

function segmentIsRemoval(segment: string, shell: 'bash' | 'powershell'): boolean {
  if (shell === 'powershell') {
    return /\b(Remove-Item|rm|del|rd|rmdir)\b/i.test(segment)
  }
  try {
    const cmd = parseSegment(segment).words[0]?.literal.replace(/\.exe$/i, '') ?? ''
    if (cmd === 'rm' || cmd === 'rmdir') return true
  } catch {
    /* fall through */
  }
  return /\b(rm|rmdir)\b/.test(segment)
}

function bashCommandWordQuoted(segment: string): boolean {
  try {
    return Boolean(parseSegment(segment).words[0]?.hadQuote)
  } catch {
    return false
  }
}

/**
 * Validate shell command paths against cwd + session additional directories.
 */
export function evaluateShellPathPermission(opts: {
  toolName: 'bash' | 'powershell'
  command: string
  cwd: string
  additionalWorkingDirectories?: readonly string[]
}): ShellPathPermissionResult {
  const cmd = String(opts.command ?? '').trim()
  if (!cmd) {
    return { allowed: true, behavior: 'allow', reason: '' }
  }
  const shell = opts.toolName
  const extra = opts.additionalWorkingDirectories ?? []
  const cwd = opts.cwd

  try {
    if (shell === 'bash') {
      for (const segment of splitShellSegments(cmd)) {
        parseSegment(segment)
      }
    }
  } catch {
    return {
      allowed: false,
      behavior: 'deny',
      reason: 'Shell command could not be parsed — treated as dangerous (fail-closed)'
    }
  }

  for (const segment of splitShellSegments(cmd)) {
    if (segmentCreatesLink(segment)) {
      return {
        allowed: false,
        behavior: 'ask',
        reason:
          'Shell command creates a filesystem link (SymbolicLink/Junction) — manual approval required'
      }
    }

    if (segmentIsRemoval(segment, shell)) {
      for (const p of extractPathsFromSegment(segment, shell)) {
        const abs = path.isAbsolute(p) ? path.resolve(p) : expandPath(cwd, p)
        if (isDangerousRemovalPath(abs)) {
          return {
            allowed: false,
            behavior: 'deny',
            reason: `Dangerous removal path in shell: ${p}`
          }
        }
      }
      if (shell === 'bash' && bashCommandWordQuoted(segment)) {
        return {
          allowed: false,
          behavior: 'ask',
          reason:
            'Quoted/obfuscated removal command — treated as dangerous (ask required)'
        }
      }
    }

    const paths = extractPathsFromSegment(segment, shell)
    if (shell === 'bash') {
      try {
        for (const r of parseSegment(segment).redirects) {
          if (r.target) paths.push(r.target)
        }
      } catch {
        return {
          allowed: false,
          behavior: 'deny',
          reason: 'Shell command could not be parsed — treated as dangerous (fail-closed)'
        }
      }
    }
    const writeLike = segmentIsWriteLike(segment, shell)
    for (const p of paths) {
      if (!pathInAllowedWorkingPaths(cwd, p, extra)) {
        const label = writeLike
          ? 'Shell write targets path outside allowed working directories (ask required)'
          : 'Shell accesses path outside allowed working directories (ask required)'
        return {
          allowed: false,
          behavior: 'ask',
          reason: `${label}: ${p}`
        }
      }
    }
  }

  return { allowed: true, behavior: 'allow', reason: '' }
}

/** Grant working dirs from shell command paths (CC addDirectories after allow). */
export function grantWorkingDirectoriesFromShellCommand(
  toolName: 'bash' | 'powershell',
  command: string,
  cwd: string,
  addDir: (dir: string) => void
): void {
  const cmd = String(command ?? '').trim()
  if (!cmd) return
  for (const segment of splitShellSegments(cmd)) {
    for (const p of extractPathsFromSegment(segment, toolName)) {
      try {
        const abs = path.isAbsolute(p) ? path.resolve(p) : expandPath(cwd, p)
        addDir(path.dirname(abs))
      } catch {
        /* skip bad token */
      }
    }
  }
}
