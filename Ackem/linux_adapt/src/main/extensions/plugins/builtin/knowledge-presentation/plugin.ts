// [knowledge-presentation/plugin] — 知识整理内置插件门面

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../settings'
import type { WorkIntentResult } from '../../../../engine/types'
import {
  applyKnowledgeUserMessage,
  createDefaultKnowledgePrefs,
  shouldUseKnowledgeThisTurn,
  type KnowledgeSessionPrefs
} from './overrides'
import {
  isKnowledgeSeekingIntent,
  extractOrganizeTopicFromMessage,
  resolveOrganizeTopic,
  shouldPreferWebSearch,
  wantsOrganizeAsCard,
  wantsOrganizeExistingContent
} from './intent'
import { createLogger } from '../../../../logger'
import {
  lastUserMessageFromContext,
  resolveKnowledgeTopicLabel,
  runKnowledgeAnswerChain,
  type KnowledgeAnswerInput
} from './knowledgeAnswer'

export const KNOWLEDGE_PRESENTATION_PLUGIN_ID = 'ackem/knowledge-presentation@1.0.0'

const log = createLogger('knowledge-presentation')

export type KnowledgeContextResolveInput = {
  sessionId: string
  userText: string
  recentMessages?: Array<{ role: string; content: string }>
  workIntent: WorkIntentResult
}

export type KnowledgeContextResolveResult = {
  /** 剥离显式指令后送入 LLM 的用户文本 */
  userTextForLlm: string
  knowledgeTopic?: string
}

class KnowledgePresentationPlugin {
  private prefsBySession = new Map<string, KnowledgeSessionPrefs>()

  private sessionPrefs(sessionId: string): KnowledgeSessionPrefs {
    let p = this.prefsBySession.get(sessionId)
    if (!p) {
      p = createDefaultKnowledgePrefs()
      this.prefsBySession.set(sessionId, p)
    }
    return p
  }

  /** context:build 阶段：决定是否生成纸面卡及主题 */
  resolveForContextBuild(input: KnowledgeContextResolveInput): KnowledgeContextResolveResult {
    const prefs = this.sessionPrefs(input.sessionId)
    const { stripped, turnOverride } = applyKnowledgeUserMessage(input.userText, prefs)
    const autoWants = isKnowledgeSeekingIntent(input.workIntent)
    const trimmed = input.userText.trim()

    // 整理已有内容（指代上文 / 刚搜到的结果）→ 知识整理，禁止二次联网
    if (wantsOrganizeExistingContent(trimmed, input.recentMessages)) {
      const topic = resolveOrganizeTopic(trimmed, input.recentMessages)
      log.info('用户要求整理已有内容', { topic, userText: trimmed.slice(0, 80) })
      return { userTextForLlm: stripped, knowledgeTopic: topic }
    }

    // 显式要求整理为纸面卡（"介绍一下X"、"什么是X"等）→ 优先于 web_search
    if (wantsOrganizeAsCard(trimmed)) {
      const topic =
        extractOrganizeTopicFromMessage(trimmed) ??
        resolveKnowledgeTopicLabel(
          input.workIntent.extractedQuery || stripped,
          input.recentMessages
        )
      log.info('用户要求整理为纸面卡', { topic, userText: trimmed.slice(0, 80) })
      return { userTextForLlm: stripped, knowledgeTopic: topic }
    }

    // 显式联网搜索（"帮我搜一下X"）→ web_search
    if (shouldPreferWebSearch(trimmed, input.recentMessages)) {
      log.info('跳过知识整理，改走 web_search', {
        userText: trimmed.slice(0, 80),
        extractedQuery: input.workIntent.extractedQuery
      })
      return { userTextForLlm: stripped }
    }

    const useKnowledge = shouldUseKnowledgeThisTurn(prefs, turnOverride, autoWants)

    if (!useKnowledge) {
      return { userTextForLlm: stripped }
    }

    const querySource = (input.workIntent.extractedQuery || stripped).trim()
    const topic = resolveKnowledgeTopicLabel(querySource, input.recentMessages)
    return { userTextForLlm: stripped, knowledgeTopic: topic }
  }

  async runAnswerChain(
    webContents: WebContents,
    settings: AppSettings,
    contextMessages: Array<{ role: string; content: unknown }>,
    input: KnowledgeAnswerInput,
    onStatus?: (text: string) => void
  ): Promise<string> {
    return runKnowledgeAnswerChain(webContents, settings, contextMessages, input, onStatus)
  }

  lastUserMessageFromContext(
    messages: Array<{ role: string; content: unknown }>
  ): string {
    return lastUserMessageFromContext(messages)
  }
}

let instance: KnowledgePresentationPlugin | null = null

export function getKnowledgePresentationPlugin(): KnowledgePresentationPlugin {
  if (!instance) instance = new KnowledgePresentationPlugin()
  return instance
}
