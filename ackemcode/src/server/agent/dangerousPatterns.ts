/**
 * Heuristic risk gate for permission auto-allow paths (acceptEdits / session allow / auto).
 * Spirit-aligned with Claude Code dangerousPatterns + path safety — Ackem-owned tables
 * (not a port of Anthropic ant-only lists or yoloClassifier prompts).
 *
 * D2: expanded critical/high coverage + sensitive paths for mis-allow regression.
 * GM-BASH: structural checks via shellSecurity (pipelines / PS download-exec / misparse).
 */
import path from 'node:path'
import { normalizeToolName } from './permissionRules.js'
import {
  classifyShellSecurity,
  normalizeForSecurityScan
} from './shellSecurity.js'
import { isDangerousRemovalPath } from './pathValidation.js'
import { pathInAllowedWorkingPaths } from '../tools/files/pathUtils.js'

export type RiskLevel = 'none' | 'low' | 'high' | 'critical'

export type RiskClassification = {
  level: RiskLevel
  reason: string
}

const WRITE_TOOLS = new Set([
  'write_file',
  'search_replace',
  'notebook_edit'
])

const SHELL_TOOLS = new Set(['bash', 'powershell'])

export type ShellPattern = { re: RegExp; reason: string; id: string }

/**
 * Critical: deny unless bypassPermissions.
 * Categories: root wipe, remote→shell RCE, disk destroy, fork bomb, privilege bombs.
 */
export const CRITICAL_SHELL_PATTERNS: readonly ShellPattern[] = [
  {
    id: 'rm_rf_root',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf|--no-preserve-root)\b[\s\S]*?(^|[\s"'`])\/(\s|$|[\*"'`])/m,
    reason: 'Critical: recursive delete targeting filesystem root'
  },
  {
    id: 'rm_rf_star',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf)\b[\s\S]*?\/\*/i,
    reason: 'Critical: recursive delete of /*'
  },
  {
    id: 'rm_rf_windows_root',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf)\b[\s\S]*[\\/]Windows([\\/]|$)/i,
    reason: 'Critical: recursive delete under Windows system tree'
  },
  {
    id: 'curl_pipe_shell',
    re: /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?((ba)?sh|zsh|fish|dash)\b/i,
    reason: 'Critical: download piped to shell'
  },
  {
    id: 'curl_pipe_bash_lc',
    re: /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?((ba)?sh|zsh)\s+-c\b/i,
    reason: 'Critical: download piped to shell -c'
  },
  {
    id: 'iex_paren_iwr',
    re: /\b(iex|Invoke-Expression)\b\s*\(\s*(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b/i,
    reason: 'Critical: Invoke-Expression wrapping remote download'
  },
  {
    id: 'ps_encoded_command',
    re: /\b(powershell|pwsh)(\.exe)?\b[\s\S]*(-enc|-EncodedCommand|\/EncodedCommand)\b/i,
    reason: 'Critical: PowerShell EncodedCommand'
  },
  {
    id: 'wmi_process_create',
    re: /\b(Invoke-WmiMethod|Invoke-CimMethod|iwmi)\b[\s\S]*Win32_Process[\s\S]*\bCreate\b/i,
    reason: 'Critical: WMI/CIM process Create'
  },
  {
    id: 'bash_process_subst_curl',
    re: /\b(ba)?sh\s+<\s*\(\s*(curl|wget)\b/i,
    reason: 'Critical: shell process-substitution of remote script'
  },
  {
    id: 'iwr_iex',
    re: /\b(iwr|Invoke-WebRequest|wget)\b[\s\S]*\|\s*(iex|Invoke-Expression)\b/i,
    reason: 'Critical: download piped to Invoke-Expression'
  },
  {
    id: 'iex_download',
    re: /\bInvoke-Expression\b[\s\S]*\b(iwr|Invoke-WebRequest|DownloadString|DownloadFile)\b/i,
    reason: 'Critical: Invoke-Expression over remote download'
  },
  {
    id: 'iex_webclient',
    re: /\b(iex|Invoke-Expression)\b[\s\S]*\b(Net\.WebClient|DownloadString)\b/i,
    reason: 'Critical: Invoke-Expression + WebClient download'
  },
  {
    id: 'format_disk',
    re: /\b(Format-Volume|Clear-Disk|format\s+[a-z]:)\b/i,
    reason: 'Critical: disk format / clear'
  },
  {
    id: 'dd_block',
    re: /\bdd\b[\s\S]*\bof\s*=\s*\/dev\//i,
    reason: 'Critical: dd write to block device'
  },
  {
    id: 'mkfs',
    re: /\bmkfs(\.|$|\s)/i,
    reason: 'Critical: mkfs'
  },
  {
    id: 'fork_bomb',
    re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/,
    reason: 'Critical: fork bomb'
  },
  {
    id: 'base64_pipe_shell',
    re: /\bbase64\s+(-d|--decode)\b[\s\S]*\|\s*(ba)?sh\b/i,
    reason: 'Critical: base64-decoded payload piped to shell'
  },
  {
    id: 'python_exec_urllib',
    re: /\bpython[0-9.]*\b[\s\S]*(-c|--command)\b[\s\S]*(urllib|requests|urlopen)[\s\S]*(exec|system|popen|subprocess)/i,
    reason: 'Critical: python one-liner remote fetch + exec'
  },
  {
    id: 'node_eval_http',
    re: /\bnode\b[\s\S]*(-e|--eval)\b[\s\S]*(https?:\/\/|child_process|execSync)/i,
    reason: 'Critical: node -e with network/exec'
  },
  {
    id: 'chmod_suid_system',
    re: /\bchmod\b[\s\S]*\+s\b[\s\S]*\/(bin|sbin|usr)\b/i,
    reason: 'Critical: setuid on system binary'
  },
  {
    id: 'wipefs',
    re: /\bwipefs\b/i,
    reason: 'Critical: wipefs'
  },
  {
    id: 'diskpart',
    re: /\bdiskpart\b/i,
    reason: 'Critical: diskpart'
  }
]

/**
 * High: blocks auto-allow / session allow; ask (or deny under dontAsk).
 * Not critical-deny by default — user may still approve.
 */
export const HIGH_SHELL_PATTERNS: readonly ShellPattern[] = [
  {
    id: 'rm_rf',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r|-rf)\b/i,
    reason: 'High risk: rm -rf'
  },
  {
    id: 'remove_item_force',
    re: /\b(Remove-Item|ri|rd|rmdir)\b[\s\S]*-(Recurse|Force|r|f)\b/i,
    reason: 'High risk: recursive/forced Remove-Item'
  },
  {
    id: 'git_push_force',
    re: /\bgit\s+push\b[\s\S]*(?:--force(?!-with-lease)\b|\s-f\b)/i,
    reason: 'High risk: git push --force'
  },
  {
    id: 'git_reset_hard',
    re: /\bgit\s+reset\s+--hard\b/i,
    reason: 'High risk: git reset --hard'
  },
  {
    id: 'git_clean_fdx',
    re: /\bgit\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*d[a-zA-Z]*x\b|\bgit\s+clean\s+-[a-zA-Z]*fdx\b/i,
    reason: 'High risk: git clean -fdx'
  },
  {
    id: 'git_checkout_force',
    re: /\bgit\s+checkout\s+(-f|--force)\b/i,
    reason: 'High risk: git checkout --force'
  },
  {
    id: 'git_config_hook',
    re: /\bgit\s+config\b[\s\S]*(core\.hooksPath|core\.sshCommand|alias\.)/i,
    reason: 'High risk: git config that can run arbitrary commands'
  },
  {
    id: 'git_stash_drop',
    re: /\bgit\s+stash\s+(drop|clear)\b/i,
    reason: 'High risk: git stash drop/clear'
  },
  {
    id: 'git_branch_force_delete',
    re: /\bgit\s+branch\s+(-D|-d\s+--force)\b/i,
    reason: 'High risk: force-delete git branch'
  },
  {
    id: 'git_commit_amend_pushed',
    re: /\bgit\s+commit\s+.*--amend\b/i,
    reason: 'High risk: git commit --amend (may rewrite published history)'
  },
  {
    id: 'drop_truncate',
    re: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    reason: 'High risk: DROP/TRUNCATE'
  },
  {
    id: 'kubectl_delete',
    re: /\bkubectl\s+(delete|drain|cordon)\b/i,
    reason: 'High risk: kubectl destructive'
  },
  {
    id: 'terraform_destroy',
    re: /\bterraform\s+destroy\b/i,
    reason: 'High risk: terraform destroy'
  },
  {
    id: 'sudo_destructive',
    re: /\bsudo\s+(rm|dd|mkfs|shutdown|reboot|chmod|chown|passwd|userdel|deluser)\b/i,
    reason: 'High risk: sudo destructive command'
  },
  {
    id: 'chmod_777',
    re: /\bchmod\b[\s\S]*\b777\b/i,
    reason: 'High risk: chmod 777'
  },
  {
    id: 'chown_root_recurse',
    re: /\bchown\s+-[a-zA-Z]*R\b[\s\S]*\broot\b/i,
    reason: 'High risk: recursive chown root'
  },
  {
    id: 'shutdown_reboot',
    re: /\b(shutdown|reboot|halt|poweroff|init\s+0)\b/i,
    reason: 'High risk: system shutdown/reboot'
  },
  {
    id: 'kill_all',
    re: /\b(killall|pkill)\b[\s\S]*(-9|--signal\s*9)\b/i,
    reason: 'High risk: killall/pkill -9'
  },
  {
    id: 'docker_prune',
    re: /\bdocker\s+(system\s+prune|volume\s+prune|image\s+prune)\b[\s\S]*-f\b/i,
    reason: 'High risk: docker prune -f'
  },
  {
    id: 'docker_rm_force',
    re: /\bdocker\s+(rm|rmi|container\s+rm)\b[\s\S]*(-f|--force)\b/i,
    reason: 'High risk: docker force remove'
  },
  {
    id: 'npm_publish',
    re: /\b(npm|pnpm|yarn)\s+publish\b/i,
    reason: 'High risk: package publish'
  },
  {
    id: 'curl_upload_secrets',
    re: /\b(curl|wget)\b[\s\S]*(-d|--data|--upload-file|-F|--form)\b[\s\S]*(\.env|id_rsa|credentials|token|secret)/i,
    reason: 'High risk: upload of likely secrets'
  },
  {
    id: 'history_wipe',
    re: /\bhistory\s+-c\b|\bcat\s+\/dev\/null\s*>\s*~?\/?\.bash_history\b|\bRemove-Item\b[\s\S]*PSReadLine/i,
    reason: 'High risk: wipe shell history'
  },
  {
    id: 'iptables_flush',
    re: /\b(iptables|nft)\b[\s\S]*(-F|--flush)\b/i,
    reason: 'High risk: flush firewall rules'
  },
  {
    id: 'ufw_disable',
    re: /\bufw\s+disable\b/i,
    reason: 'High risk: disable firewall'
  },
  {
    id: 'crontab_wipe',
    re: /\bcrontab\s+-r\b/i,
    reason: 'High risk: remove crontab'
  },
  {
    id: 'userdel',
    re: /\b(userdel|deluser|Remove-LocalUser)\b/i,
    reason: 'High risk: delete user account'
  },
  {
    id: 'aws_destructive',
    re: /\baws\s+\S+\s+(delete-|terminate-|remove-)/i,
    reason: 'High risk: AWS delete/terminate'
  },
  {
    id: 'gcloud_delete',
    re: /\bgcloud\b[\s\S]*\b(delete|remove)\b/i,
    reason: 'High risk: gcloud delete'
  },
  {
    id: 'find_delete',
    re: /\bfind\b[\s\S]*-delete\b|\bfind\b[\s\S]*-exec\s+rm\b/i,
    reason: 'High risk: find -delete / -exec rm'
  },
  {
    id: 'shred',
    re: /\bshred\b/i,
    reason: 'High risk: shred'
  },
  {
    id: 'eval_shell',
    re: /(^|[;&|]\s*)eval\s+["'`$]/m,
    reason: 'High risk: eval with dynamic payload'
  },
  {
    id: 'bash_c_curl',
    re: /\b(ba)?sh\s+-c\b[\s\S]*(curl|wget|iwr)\b/i,
    reason: 'High risk: shell -c wrapping remote fetch'
  },
  {
    id: 'nc_reverse',
    re: /\b(nc|ncat|netcat)\b[\s\S]*(-e|--exec)\b/i,
    reason: 'High risk: netcat exec (possible reverse shell)'
  },
  {
    id: 'python_pty_spawn',
    re: /\bpython[0-9.]*\b[\s\S]*pty\.spawn\b/i,
    reason: 'High risk: python pty.spawn'
  },
  {
    id: 'reg_delete',
    re: /\b(reg\s+delete|Remove-ItemProperty)\b[\s\S]*HKLM/i,
    reason: 'High risk: delete HKLM registry'
  },
  {
    id: 'set_executionpolicy_bypass',
    re: /\bSet-ExecutionPolicy\b[\s\S]*\bBypass\b/i,
    reason: 'High risk: PowerShell ExecutionPolicy Bypass'
  },
  {
    id: 'disable_defender',
    re: /\b(Set-MpPreference|Disable-WindowsDefender|defender)\b[\s\S]*(Disable|exclusion)/i,
    reason: 'High risk: disable / weaken Defender'
  }
]

/** Paths that must not be auto-edited even under acceptEdits. */
export const SENSITIVE_PATH_PATTERNS: readonly {
  re: RegExp
  reason: string
  id: string
}[] = [
  {
    id: 'dot_git',
    re: /(^|[\\/])\.git([\\/]|$)/i,
    reason: 'Sensitive path: .git'
  },
  {
    id: 'dot_ssh',
    re: /(^|[\\/])\.ssh([\\/]|$)/i,
    reason: 'Sensitive path: .ssh'
  },
  {
    id: 'id_rsa',
    re: /(^|[\\/])id_rsa([^a-z0-9_]|$)/i,
    reason: 'Sensitive path: private key'
  },
  {
    id: 'id_ed25519',
    re: /(^|[\\/])id_ed25519([^a-z0-9_]|$)/i,
    reason: 'Sensitive path: private key'
  },
  {
    id: 'dot_env',
    re: /(^|[\\/])\.env(\.|$)/i,
    reason: 'Sensitive path: .env'
  },
  {
    id: 'aws_credentials',
    re: /(^|[\\/])\.aws([\\/]|$)|(^|[\\/])credentials(\.csv)?$/i,
    reason: 'Sensitive path: AWS credentials'
  },
  {
    id: 'gnupg',
    re: /(^|[\\/])\.gnupg([\\/]|$)/i,
    reason: 'Sensitive path: .gnupg'
  },
  {
    id: 'kube_config',
    re: /(^|[\\/])\.kube([\\/]|$)/i,
    reason: 'Sensitive path: .kube'
  },
  {
    id: 'docker_config',
    re: /(^|[\\/])\.docker([\\/]config\.json)$/i,
    reason: 'Sensitive path: docker config'
  },
  {
    id: 'npmrc_auth',
    re: /(^|[\\/])\.npmrc$/i,
    reason: 'Sensitive path: .npmrc (may hold tokens)'
  },
  {
    id: 'pypirc',
    re: /(^|[\\/])\.pypirc$/i,
    reason: 'Sensitive path: .pypirc'
  },
  {
    id: 'netrc',
    re: /(^|[\\/])\.netrc$/i,
    reason: 'Sensitive path: .netrc'
  },
  {
    id: 'credentials_json',
    re: /(^|[\\/])(credentials|service[-_]?account)\.json$/i,
    reason: 'Sensitive path: credentials JSON'
  },
  {
    id: 'pem_key',
    re: /\.(pem|p12|pfx|key)$/i,
    reason: 'Sensitive path: key material file'
  }
]

/** @deprecated use CRITICAL_SHELL_PATTERNS */
const CRITICAL_SHELL = CRITICAL_SHELL_PATTERNS
/** @deprecated use HIGH_SHELL_PATTERNS */
const HIGH_SHELL = HIGH_SHELL_PATTERNS
/** @deprecated use SENSITIVE_PATH_PATTERNS */
const SENSITIVE_PATH_RES = SENSITIVE_PATH_PATTERNS

function commandFromInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const c = o.command ?? o.cmd
  return typeof c === 'string' ? c : ''
}

function pathFromInput(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  const p = o.path ?? o.file_path ?? o.notebook_path
  return typeof p === 'string' && p.length > 0 ? p : null
}

export function resolveToolPath(filePath: string, cwd?: string): string {
  if (path.isAbsolute(filePath)) return path.normalize(filePath)
  const base = cwd && cwd.length > 0 ? cwd : process.cwd()
  return path.resolve(base, filePath)
}

export function pathIsInsideCwd(resolved: string, cwd: string): boolean {
  const base = path.resolve(cwd)
  const target = path.resolve(resolved)
  const rel = path.relative(base, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function classifyShell(command: string): RiskClassification {
  const c = command.trim()
  if (!c) return { level: 'none', reason: 'empty command' }

  // GM-BASH structural layer first (pipelines / PS / misparse); fail-closed
  const structural = classifyShellSecurity(c)
  if (structural.level === 'critical' || structural.level === 'high') {
    return { level: structural.level, reason: structural.reason }
  }

  const variants = [c, normalizeForSecurityScan(c)]
  for (const v of variants) {
    for (const p of CRITICAL_SHELL) {
      if (p.re.test(v)) return { level: 'critical', reason: p.reason }
    }
  }
  for (const v of variants) {
    for (const p of HIGH_SHELL) {
      if (p.re.test(v)) return { level: 'high', reason: p.reason }
    }
  }

  // GM-PERM: rm/rmdir targeting root/home/drive → critical (pathValidation)
  if (/\brm(?:dir)?\b/i.test(c)) {
    const tokens = c.split(/\s+/).filter((t) => t && !t.startsWith('-'))
    for (const t of tokens.slice(1)) {
      // skip the rm/rmdir verb itself already sliced; check path-like args
      if (/^rm/i.test(t)) continue
      if (isDangerousRemovalPath(t.replace(/^['"]|['"]$/g, ''))) {
        return {
          level: 'critical',
          reason: `Dangerous removal path: ${t}`
        }
      }
    }
  }

  return { level: 'none', reason: 'no dangerous shell pattern' }
}

function classifyWritePath(
  filePath: string,
  cwd?: string,
  additionalWorkingDirectories?: readonly string[]
): RiskClassification {
  const resolved = resolveToolPath(filePath, cwd)
  for (const p of SENSITIVE_PATH_RES) {
    if (p.re.test(resolved) || p.re.test(filePath)) {
      return { level: 'high', reason: p.reason }
    }
  }
  if (
    cwd &&
    cwd.length > 0 &&
    !pathInAllowedWorkingPaths(cwd, filePath, additionalWorkingDirectories ?? [])
  ) {
    return {
      level: 'high',
      reason: 'Write outside working directory'
    }
  }
  return { level: 'none', reason: 'in-project write' }
}

/**
 * Classify tool risk for permission gating.
 * Callers must fail-closed on throw (ask or deny — never default allow).
 */
export function classifyToolRisk(opts: {
  toolName: string
  input?: unknown
  cwd?: string
  additionalWorkingDirectories?: readonly string[]
}): RiskClassification {
  const toolName = normalizeToolName(opts.toolName)
  if (SHELL_TOOLS.has(toolName)) {
    return classifyShell(commandFromInput(opts.input))
  }
  if (WRITE_TOOLS.has(toolName)) {
    const p = pathFromInput(opts.input)
    if (!p) return { level: 'none', reason: 'missing path' }
    return classifyWritePath(p, opts.cwd, opts.additionalWorkingDirectories)
  }
  return { level: 'none', reason: 'tool not risk-classified' }
}

/** True when auto-allow paths (acceptEdits / session / allow rules) must not bypass. */
export function riskBlocksAutoAllow(level: RiskLevel): boolean {
  return level === 'high' || level === 'critical'
}

/** Counts for smoke / doctor panels. */
export function dangerousPatternStats(): {
  criticalShell: number
  highShell: number
  sensitivePaths: number
} {
  return {
    criticalShell: CRITICAL_SHELL_PATTERNS.length,
    highShell: HIGH_SHELL_PATTERNS.length,
    sensitivePaths: SENSITIVE_PATH_PATTERNS.length
  }
}

/**
 * Which shell pattern matched (for tests / denial UX). Empty if none.
 */
export function matchShellDangerousPattern(command: string): {
  level: RiskLevel
  id?: string
  reason: string
} {
  const c = command.trim()
  const structural = classifyShellSecurity(c)
  if (structural.level === 'critical' || structural.level === 'high') {
    return {
      level: structural.level,
      id: structural.id,
      reason: structural.reason
    }
  }
  const variants = [c, normalizeForSecurityScan(c)]
  for (const v of variants) {
    for (const p of CRITICAL_SHELL_PATTERNS) {
      if (p.re.test(v)) return { level: 'critical', id: p.id, reason: p.reason }
    }
  }
  for (const v of variants) {
    for (const p of HIGH_SHELL_PATTERNS) {
      if (p.re.test(v)) return { level: 'high', id: p.id, reason: p.reason }
    }
  }
  return { level: 'none', reason: 'no dangerous shell pattern' }
}
