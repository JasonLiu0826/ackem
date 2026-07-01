import type { WorkIntentResult } from '../engine/types'
import { shouldSuppressExternalChatCapabilities } from '../../shared/desktopAgentModePolicy'

/** 电脑助手模式下：联网检索意图归零，改由本机查找 / use_computer 处理 */
export function applyDesktopAgentModeToWorkIntent(
  workIntent: WorkIntentResult,
  sessionActive: boolean
): WorkIntentResult {
  if (!shouldSuppressExternalChatCapabilities(sessionActive)) return workIntent
  if (workIntent.intent === 'search_web') {
    return { intent: 'none', confidence: 0, proactive: false }
  }
  return workIntent
}

export function shouldOfferSkillToolsInDesktopAgentSession(sessionActive: boolean): boolean {
  return !shouldSuppressExternalChatCapabilities(sessionActive)
}

export function shouldForceWebSearchInDesktopAgentSession(
  sessionActive: boolean,
  query: string | undefined
): string | undefined {
  if (shouldSuppressExternalChatCapabilities(sessionActive)) return undefined
  return query
}
