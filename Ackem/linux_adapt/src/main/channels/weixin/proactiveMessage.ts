import type { AppSettings } from '../../settings'
import { normalizePeerSessionId } from './store'
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
  const sessionId = normalizePeerSessionId(args.peerId)
  return composeCompanionProactiveMessage({
    dataRoot: args.dataRoot,
    settings: args.settings,
    sessionId,
    harass: false
  })
}
