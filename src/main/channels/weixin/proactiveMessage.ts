import type { AppSettings } from '../../settings'
import { resolveConversationSessionId } from '../conversation'
import {
  composeCompanionProactiveMessage,
  type ProactiveMessageKind
} from '../../companion/proactiveCompose'

export type { ProactiveMessageKind }

export async function composeWeixinProactiveMessage(args: {
  dataRoot: string
  settings: AppSettings
  peerId: string
}): Promise<{ raw: string; kind: ProactiveMessageKind } | null> {
  // 主动搭话也要基于三端统一的那段对话，否则她会对着空历史找话题
  const sessionId = resolveConversationSessionId(args.settings.activeSessionId)
  return composeCompanionProactiveMessage({
    dataRoot: args.dataRoot,
    settings: args.settings,
    sessionId,
    harass: false
  })
}
