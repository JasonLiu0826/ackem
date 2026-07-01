import { FORBIDDEN_USER_PLUGIN_PERMISSIONS } from '../types'
import type { ArtifactBundle, UpluginArtifactBundle, UskillArtifactBundle } from './bundleTypes'
import { validateArtifactBundle } from './validateAgent'
import type { PlanDesignSpec } from '../../../../shared/planDesignSpec'
import {
  specConformanceToValidationMessages,
  validateSpecConformance
} from '../designSpec/specConformance'

export type ValidationIssueCode =
  | 'DISPATCH_KEYWORDS_EMPTY'
  | 'DISPATCH_HABITS_EMPTY'
  | 'DISPATCH_SCENARIOS_EMPTY'
  | 'DISPATCH_SUMMARY_EMPTY'
  | 'DISPATCH_MODE_INVALID'
  | 'MANIFEST_ID_INVALID'
  | 'MANIFEST_KEYWORDS_EMPTY'
  | 'MANIFEST_PERMISSIONS_EMPTY'
  | 'PERMISSION_FORBIDDEN'
  | 'INJECT_TEMPLATE_EMPTY'
  | 'SKILL_REPLY_EMPTY'
  | 'MANIFEST_FIELD_MISSING'
  | 'SPEC_CONFORMANCE'
  | 'UNKNOWN'

export type ValidationIssue = {
  code: ValidationIssueCode
  message: string
  autoRepairable: boolean
}

export type ValidationReport = {
  ok: boolean
  errors: ValidationIssue[]
}

const FATAL_PATTERNS: { re: RegExp; code: ValidationIssueCode }[] = [
  { re: /dispatch\.mode.*必须为/, code: 'DISPATCH_MODE_INVALID' }
]

const REPAIRABLE_PATTERNS: { re: RegExp; code: ValidationIssueCode }[] = [
  { re: /dispatch:\s*dispatch\.mode=dispatched.*keywords/, code: 'DISPATCH_KEYWORDS_EMPTY' },
  { re: /keywords 至少填/, code: 'DISPATCH_KEYWORDS_EMPTY' },
  { re: /manifest\.keywords 不能为空/, code: 'MANIFEST_KEYWORDS_EMPTY' },
  { re: /keyword 触发时 manifest\.keywords/, code: 'MANIFEST_KEYWORDS_EMPTY' },
  { re: /habits 至少填/, code: 'DISPATCH_HABITS_EMPTY' },
  { re: /scenarios 至少填/, code: 'DISPATCH_SCENARIOS_EMPTY' },
  { re: /summary 必填/, code: 'DISPATCH_SUMMARY_EMPTY' },
  { re: /manifest\.id 格式/, code: 'MANIFEST_ID_INVALID' },
  { re: /injectTemplate 不能为空/, code: 'INJECT_TEMPLATE_EMPTY' },
  { re: /contextInjection 或 onKeyword\.reply/, code: 'SKILL_REPLY_EMPTY' },
  { re: /manifest\.\w+ 缺失/, code: 'MANIFEST_FIELD_MISSING' },
  { re: /manifest 基础字段缺失/, code: 'MANIFEST_FIELD_MISSING' },
  { re: /manifest\.permissions 不能为空/, code: 'MANIFEST_PERMISSIONS_EMPTY' },
  { re: /禁止的权限|forbidden.*permission/i, code: 'PERMISSION_FORBIDDEN' },
  { re: /^spec: /, code: 'SPEC_CONFORMANCE' }
]

export function classifyValidationMessage(message: string): ValidationIssue {
  for (const { re, code } of FATAL_PATTERNS) {
    if (re.test(message)) {
      return { code, message, autoRepairable: false }
    }
  }
  for (const { re, code } of REPAIRABLE_PATTERNS) {
    if (re.test(message)) {
      return { code, message, autoRepairable: true }
    }
  }
  return { code: 'UNKNOWN', message, autoRepairable: false }
}

export function buildValidationReport(errorMessages: string[]): ValidationReport {
  const errors = errorMessages.map(classifyValidationMessage)
  return { ok: errors.length === 0, errors }
}

export function validateBundleWithPermissions(bundle: ArtifactBundle): ValidationReport {
  return validateBundleWithSpec(bundle, null)
}

export function validateBundleWithSpec(
  bundle: ArtifactBundle,
  spec: PlanDesignSpec | null | undefined
): ValidationReport {
  const messages = [...validateArtifactBundle(bundle)]
  const perms = bundle.manifest.permissions ?? []
  for (const p of perms) {
    if (FORBIDDEN_USER_PLUGIN_PERMISSIONS.includes(p as (typeof FORBIDDEN_USER_PLUGIN_PERMISSIONS)[number])) {
      messages.push(`禁止的权限: ${p}（用户扩展不可申请）`)
    }
  }
  messages.push(...specConformanceToValidationMessages(validateSpecConformance(spec, bundle)))
  return buildValidationReport(messages)
}

export function formatValidationErrors(report: ValidationReport): string {
  return report.errors.map((e) => e.message).join('; ')
}
