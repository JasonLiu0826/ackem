/**
 * Dangerous permanent allow-rules (CC permissionSetup isDangerous*Permission spirit).
 * Broad allow like Bash(*) / Bash(python:*) / agent bypass the auto classifier & S13 gray zone.
 * Ackem-owned lists — not a dump of Anthropic ant-only patterns.
 */
import {
  normalizeToolName,
  permissionRuleValueFromString,
  type ParsedPermissionRule
} from './permissionRules.js'

/** Interpreters / runners that can execute arbitrary code via a prefix allow. */
export const DANGEROUS_SHELL_PREFIXES = [
  'python',
  'python3',
  'python2',
  'node',
  'deno',
  'tsx',
  'ruby',
  'perl',
  'php',
  'lua',
  'npx',
  'bunx',
  'npm run',
  'yarn run',
  'pnpm run',
  'bun run',
  'bash',
  'sh',
  'zsh',
  'fish',
  'ssh',
  'eval',
  'exec',
  'env',
  'xargs',
  'sudo',
  'curl',
  'wget',
  // Cloud / infra (broad prefix allow = silent mutate)
  'kubectl',
  'aws',
  'gcloud',
  'gsutil',
  'az',
  'docker',
  'podman',
  'terraform',
  'pulumi',
  'gh',
  'gh api',
  // PowerShell / Windows
  'pwsh',
  'powershell',
  'cmd',
  'wsl',
  'iex',
  'invoke-expression',
  'icm',
  'invoke-command',
  'start-process',
  'saps',
  'start-job',
  'add-type',
  'new-object'
] as const

export type DangerousAllowHit = {
  raw: string
  toolName: string
  ruleContent?: string
  reason: string
}

function matchesDangerousPrefix(content: string, pattern: string): boolean {
  const c = content.trim().toLowerCase()
  const p = pattern.toLowerCase()
  if (c === p) return true
  if (c === '*') return true
  if (c === `${p}:*`) return true
  if (c === `${p}*`) return true
  if (c === `${p} *`) return true
  if (c.startsWith(`${p} -`) && c.endsWith('*')) return true
  // Windows .exe variants on first token
  const sp = p.indexOf(' ')
  const exe =
    sp === -1 ? `${p}.exe` : `${p.slice(0, sp)}.exe${p.slice(sp)}`
  if (c === exe) return true
  if (c === `${exe}:*`) return true
  if (c === `${exe}*`) return true
  if (c === `${exe} *`) return true
  if (c.startsWith(`${exe} -`) && c.endsWith('*')) return true
  return false
}

/**
 * True when a permanent allow rule would auto-approve arbitrary / high-bypass actions.
 */
export function isDangerousAllowRule(
  toolName: string,
  ruleContent: string | undefined
): { dangerous: boolean; reason: string } {
  const name = normalizeToolName(toolName)

  // Any agent allow bypasses per-tool checks for the spawn itself (CC Agent spirit)
  if (name === 'agent') {
    return {
      dangerous: true,
      reason: 'Allowing agent bypasses sub-agent permission evaluation'
    }
  }

  if (name !== 'bash' && name !== 'powershell') {
    return { dangerous: false, reason: '' }
  }

  // Tool-level allow: Bash / Bash(*) / Bash()
  if (ruleContent === undefined || ruleContent.trim() === '') {
    return {
      dangerous: true,
      reason: `${name} tool-level allow permits all commands`
    }
  }
  const content = ruleContent.trim()
  if (content === '*') {
    return {
      dangerous: true,
      reason: `${name}(*) wildcard allow permits all commands`
    }
  }

  for (const pattern of DANGEROUS_SHELL_PREFIXES) {
    if (matchesDangerousPrefix(content, pattern)) {
      return {
        dangerous: true,
        reason: `${name}(${content}) allow can execute arbitrary code via ${pattern}`
      }
    }
  }

  return { dangerous: false, reason: '' }
}

export function isDangerousAllowRuleString(rule: string): DangerousAllowHit | null {
  const parsed = permissionRuleValueFromString(rule)
  const check = isDangerousAllowRule(parsed.toolName, parsed.ruleContent)
  if (!check.dangerous) return null
  return {
    raw: parsed.raw,
    toolName: parsed.toolName,
    ruleContent: parsed.ruleContent,
    reason: check.reason
  }
}

export type StripDangerousResult = {
  allow: string[]
  stripped: DangerousAllowHit[]
}

/** Remove dangerous entries from an allow list (deny/ask untouched). */
export function stripDangerousAllowRules(allow: string[]): StripDangerousResult {
  const kept: string[] = []
  const stripped: DangerousAllowHit[] = []
  for (const rule of allow) {
    const hit = isDangerousAllowRuleString(rule)
    if (hit) stripped.push(hit)
    else kept.push(rule)
  }
  return { allow: kept, stripped }
}

export function findDangerousAllowRules(allow: string[]): DangerousAllowHit[] {
  return stripDangerousAllowRules(allow).stripped
}

/**
 * Env ACKEM_PERMISSIONS_STRIP_DANGEROUS:
 *   never  — do not strip
 *   auto   — strip editable-layer dangerous allows when permissionMode=auto
 *   always — strip editable-layer dangerous allows in every mode
 *   strict — same as always (D3 alias; policy layer never stripped)
 */
export type StripDangerousMode = 'never' | 'auto' | 'always' | 'strict'

export function resolveStripDangerousMode(
  env = process.env.ACKEM_PERMISSIONS_STRIP_DANGEROUS
): StripDangerousMode {
  const v = (env || '').trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'off' || v === 'never') return 'never'
  if (v === '1' || v === 'true' || v === 'always' || v === 'on') return 'always'
  if (v === 'strict') return 'strict'
  return 'auto'
}

export function shouldStripDangerousAllows(
  permissionMode: string | undefined,
  stripMode: StripDangerousMode = resolveStripDangerousMode()
): boolean {
  if (stripMode === 'never') return false
  if (stripMode === 'always' || stripMode === 'strict') return true
  return permissionMode === 'auto'
}

export function describeDangerousAllow(parsed: ParsedPermissionRule): string {
  const check = isDangerousAllowRule(parsed.toolName, parsed.ruleContent)
  return check.reason || parsed.raw
}
