// [knowledge-presentation/plugin] 鈥?鐭ヨ瘑鏁寸悊鍐呯疆鎻掍欢闂ㄩ潰

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

export const KNOWLEDGE_PRESENTATION_PLUGIN_ID = 'Ackem/knowledge-presentation@1.0.0'

const log = createLogger('knowledge-presentation')

export type KnowledgeContextResolveInput = {
  sessionId: string
  userText: string
  recentMessages?: Array<{ role: string; content: string }>
  workIntent: WorkIntentResult
}

export type KnowledgeContextResolveResult = {
  /** 鍓ョ鏄惧紡鎸囦护鍚庨€佸叆 LLM 鐨勭敤鎴锋枃鏈?*/
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

  /** context:build 闃舵锛氬喅瀹氭槸鍚︾敓鎴愮焊闈㈠崱鍙婁富棰?*/
  resolveForContextBuild(input: KnowledgeContextResolveInput): KnowledgeContextResolveResult {
    const prefs = this.sessionPrefs(input.sessionId)
    const { stripped, turnOverride } = applyKnowledgeUserMessage(input.userText, prefs)
    const autoWants = isKnowledgeSeekingIntent(input.workIntent)
    const trimmed = input.userText.trim()

    // 鏁寸悊宸叉湁鍐呭锛堟寚浠ｄ笂鏂?/ 鍒氭悳鍒扮殑缁撴灉锛夆啋 鐭ヨ瘑鏁寸悊锛岀姝簩娆¤仈缃?
    if (wantsOrganizeExistingContent(trimmed, input.recentMessages)) {
      const topic = resolveOrganizeTopic(trimmed, input.recentMessages)
      log.info('鐢ㄦ埛瑕佹眰鏁寸悊宸叉湁鍐呭', { topic, userText: trimmed.slice(0, 80) })
      return { userTextForLlm: stripped, knowledgeTopic: topic }
    }

    // 鏄惧紡瑕佹眰鏁寸悊涓虹焊闈㈠崱锛?浠嬬粛涓€涓媂"銆?浠€涔堟槸X"绛夛級鈫?浼樺厛浜?web_search
    if (wantsOrganizeAsCard(trimmed)) {
      const topic =
        extractOrganizeTopicFromMessage(trimmed) ??
        resolveKnowledgeTopicLabel(
          input.workIntent.extractedQuery || stripped,
          input.recentMessages
        )
      log.info('鐢ㄦ埛瑕佹眰鏁寸悊涓虹焊闈㈠崱', { topic, userText: trimmed.slice(0, 80) })
      return { userTextForLlm: stripped, knowledgeTopic: topic }
    }

    // 鏄惧紡鑱旂綉鎼滅储锛?甯垜鎼滀竴涓媂"锛夆啋 web_search
    if (shouldPreferWebSearch(trimmed, input.recentMessages)) {
      log.info('璺宠繃鐭ヨ瘑鏁寸悊锛屾敼璧?web_search', {
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
