import { detectInvestigationIntent } from '../investigation/intentRouter'
import {
  getDesktopAgentCapabilityDef,
  type DesktopAgentCapabilityMatch
} from '../../../shared/desktopAgentCapabilities'

/** 测试用：暴露 regex 兜底逻辑 */
export function matchFromRegexFallbackForTest(userText: string): DesktopAgentCapabilityMatch | null {
  const inv = detectInvestigationIntent(userText)
  if (inv?.templateId === 'games') {
    const def = getDesktopAgentCapabilityDef('investigate_games')!
    return {
      capabilityId: def.id,
      label: def.label,
      handler: def.handler,
      score: 0.5,
      matchedQuery: userText.trim(),
      routingHint: def.routingHint,
      source: 'regex_fallback'
    }
  }
  if (inv?.templateId === 'documents') {
    const def = getDesktopAgentCapabilityDef('investigate_documents')!
    return {
      capabilityId: def.id,
      label: def.label,
      handler: def.handler,
      score: 0.5,
      matchedQuery: userText.trim(),
      routingHint: def.routingHint,
      source: 'regex_fallback'
    }
  }
  if (/能做什么|你会什么|有什么功能|电脑助手.*功能/i.test(userText)) {
    const def = getDesktopAgentCapabilityDef('capability_help')!
    return {
      capabilityId: def.id,
      label: def.label,
      handler: def.handler,
      score: 0.5,
      matchedQuery: userText.trim(),
      routingHint: def.routingHint,
      source: 'regex_fallback'
    }
  }
  return null
}
