/**
 * Build SandboxRuntimeConfig from Ackem settings (CC convertToSandboxRuntimeConfig spirit).
 * Ackem-owned — does not paste Claude Code adapter source.
 */
import os from 'node:os'
import path from 'node:path'
import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'
import {
  permissionRuleValueFromString,
  type PermissionRulesConfig
} from '../agent/permissionRules.js'
import type { AckemSandboxSettings } from './types.js'

function ackemTempDir(): string {
  return path.join(os.tmpdir(), 'ackemcode-sandbox')
}

/**
 * Convert Ackem sandbox + permission rules into ASRT config.
 */
export function buildSandboxRuntimeConfig(opts: {
  cwd: string
  sandbox: AckemSandboxSettings
  permissionRules?: PermissionRulesConfig
}): SandboxRuntimeConfig {
  const cwd = path.resolve(opts.cwd || process.cwd())
  const sb = opts.sandbox
  const rules = opts.permissionRules ?? { allow: [], deny: [], ask: [] }

  const allowedDomains = [...(sb.network?.allowedDomains ?? [])]
  const deniedDomains = [...(sb.network?.deniedDomains ?? [])]

  for (const ruleString of rules.allow) {
    const rule = permissionRuleValueFromString(ruleString)
    if (
      rule.toolName === 'web_fetch' &&
      rule.ruleContent?.toLowerCase().startsWith('domain:')
    ) {
      allowedDomains.push(rule.ruleContent.slice('domain:'.length))
    }
  }
  for (const ruleString of rules.deny) {
    const rule = permissionRuleValueFromString(ruleString)
    if (
      rule.toolName === 'web_fetch' &&
      rule.ruleContent?.toLowerCase().startsWith('domain:')
    ) {
      deniedDomains.push(rule.ruleContent.slice('domain:'.length))
    }
  }

  const allowWrite = new Set<string>(['.', ackemTempDir(), cwd])
  for (const p of sb.filesystem?.allowWrite ?? []) allowWrite.add(p)

  const denyWrite = new Set<string>()
  // Block Ackem / Claude settings escapes (CC settings.json deny spirit)
  denyWrite.add(path.join(cwd, '.ackemcode', 'settings.json'))
  denyWrite.add(path.join(cwd, '.ackemcode', 'settings.local.json'))
  denyWrite.add(path.join(cwd, '.claude', 'settings.json'))
  denyWrite.add(path.join(cwd, '.claude', 'settings.local.json'))
  denyWrite.add(path.join(cwd, '.claude', 'skills'))
  denyWrite.add(path.join(cwd, '.ackemcode', 'skills'))
  for (const p of sb.filesystem?.denyWrite ?? []) denyWrite.add(p)

  const denyRead = [...(sb.filesystem?.denyRead ?? [])]
  const allowRead = [...(sb.filesystem?.allowRead ?? [])]

  return {
    network: {
      allowedDomains: [...new Set(allowedDomains)],
      deniedDomains: [...new Set(deniedDomains)],
      allowUnixSockets: sb.network?.allowUnixSockets,
      allowAllUnixSockets: sb.network?.allowAllUnixSockets,
      allowLocalBinding: sb.network?.allowLocalBinding,
      httpProxyPort: sb.network?.httpProxyPort,
      socksProxyPort: sb.network?.socksProxyPort
    },
    filesystem: {
      denyRead,
      allowRead,
      allowWrite: [...allowWrite],
      denyWrite: [...denyWrite]
    },
    ignoreViolations: sb.ignoreViolations,
    enableWeakerNestedSandbox: sb.enableWeakerNestedSandbox,
    enableWeakerNetworkIsolation: sb.enableWeakerNetworkIsolation
  }
}
