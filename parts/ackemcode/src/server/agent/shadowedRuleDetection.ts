/**
 * Shadowed / unreachable permission rules — Claude Code shadowedRuleDetection spirit.
 * Warn when allow rules are blocked by tool-wide deny/ask.
 */
import {
  normalizeToolName,
  permissionRuleValueFromString,
  type ParsedPermissionRule
} from './permissionRules.js'
import type { PermissionRulesConfig } from './permissionRules.js'

export type ShadowType = 'ask' | 'deny'

export type UnreachableRule = {
  rule: ParsedPermissionRule
  reason: string
  shadowedBy: ParsedPermissionRule
  shadowType: ShadowType
  fix: string
}

export type DetectUnreachableRulesOptions = {
  /**
   * When true (default), personal ask rules do not shadow specific allows
   * (CC: personal ask shouldn't warn as unreachable for team allows).
   * Deny shadowing always reports.
   */
  sharedAskOnly?: boolean
}

function isToolWide(rule: ParsedPermissionRule): boolean {
  return rule.ruleContent == null || rule.ruleContent === '' || rule.ruleContent === '*'
}

function isSpecificAllow(rule: ParsedPermissionRule): boolean {
  return !isToolWide(rule)
}

function parseList(raw: string[]): ParsedPermissionRule[] {
  return raw
    .filter((r) => typeof r === 'string' && r.trim())
    .map((r) => permissionRuleValueFromString(r))
}

function sameTool(a: ParsedPermissionRule, b: ParsedPermissionRule): boolean {
  return (
    a.toolName === b.toolName ||
    a.toolName === '*' ||
    b.toolName === '*' ||
    normalizeToolName(a.toolName) === normalizeToolName(b.toolName)
  )
}

function findToolWide(
  rules: ParsedPermissionRule[],
  allow: ParsedPermissionRule
): ParsedPermissionRule | undefined {
  return rules.find((r) => isToolWide(r) && sameTool(r, allow))
}

/**
 * Detect allow rules that can never fire because a tool-wide deny/ask exists.
 */
export function detectUnreachableRules(
  rules: PermissionRulesConfig,
  options: DetectUnreachableRulesOptions = {}
): UnreachableRule[] {
  const sharedAskOnly = options.sharedAskOnly !== false
  const allows = parseList(rules.allow)
  const denies = parseList(rules.deny)
  const asks = parseList(rules.ask)
  const out: UnreachableRule[] = []

  for (const allow of allows) {
    if (!isSpecificAllow(allow)) continue

    const denyHit = findToolWide(denies, allow)
    if (denyHit) {
      out.push({
        rule: allow,
        reason: `Blocked by tool-wide deny "${denyHit.raw}"`,
        shadowedBy: denyHit,
        shadowType: 'deny',
        fix: `Remove deny ${denyHit.raw}, or remove allow ${allow.raw}`
      })
      continue
    }

    // Ask shadowing: only when we treat asks as "shared" (default on for merged effective rules)
    if (sharedAskOnly) {
      const askHit = findToolWide(asks, allow)
      if (askHit) {
        out.push({
          rule: allow,
          reason: `Shadowed by tool-wide ask "${askHit.raw}"`,
          shadowedBy: askHit,
          shadowType: 'ask',
          fix: `Remove ask ${askHit.raw}, or remove allow ${allow.raw}`
        })
      }
    }
  }

  return out
}
