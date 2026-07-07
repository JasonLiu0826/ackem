import type { ChatMessage } from '../../context'
import type { AppSettings } from '../../settings'
import type { WorkIntentResult } from '../../engine/types'
import { detectPlanDocumentIntent } from '../../planDocument/intent'
import { synthesizePlanDocument } from '../../planDocument/planAnswer'
import { enrichQueryForRecency } from '../../extensions/plugins/builtin/knowledge-presentation/presentation/recencyContext'
import { resolveForcedWebSearchQuery } from '../../extensions/plugins/builtin/knowledge-presentation/intent'
import { detectTaskFrameRules } from '../../../shared/taskFrame'
import {
  lastUserMessageFromContext,
  synthesizeKnowledgeAnswer
} from '../../extensions/plugins/builtin/knowledge-presentation/knowledgeAnswer'
import { getKnowledgePresentationPlugin } from '../../extensions/plugins/builtin/knowledge-presentation/plugin'
import { buildSearchCandidateQueries } from '../../extensions/plugins/builtin/knowledge-presentation/presentation/searchQueryResolver'
import { buildAckemAwareSearchQueries } from '../../paperCard/AckemProductIdentity'
import { runIntentAwareWebSearch } from '../../extensions/plugins/builtin/knowledge-presentation/presentation/searchWithIntent'
import { synthesizeSearchExperience } from '../../extensions/plugins/builtin/knowledge-presentation/presentation/searchSynthesis'
import { resolveUserTaskFrame } from '../../taskFrame/resolveUserTaskFrame'
import { createLogger } from '../../logger'
import type { WeixinDocumentKind } from './documentDelivery'

const log = createLogger('weixin-structured')

export type WeixinStructuredTurnResult = {
  companionReply: string
  cardBody: string
  displayTitle: string
  kind: WeixinDocumentKind
}

function toContextMessages(messages: ChatMessage[]): Array<{ role: string; content: unknown }> {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

export type WeixinStructuredIntent =
  | { mode: 'knowledge'; topic: string }
  | { mode: 'plan'; topic: string }
  | { mode: 'web_search'; query: string }

export function resolveWeixinStructuredIntent(args: {
  userText: string
  sessionId: string
  recentMessages: Array<{ role: string; content: string }>
  workIntent: WorkIntentResult
}): WeixinStructuredIntent | null {
  const knowledge = getKnowledgePresentationPlugin().resolveForContextBuild({
    sessionId: args.sessionId,
    userText: args.userText,
    recentMessages: args.recentMessages,
    workIntent: args.workIntent
  })

  if (knowledge.knowledgeTopic?.trim()) {
    return { mode: 'knowledge', topic: knowledge.knowledgeTopic.trim() }
  }

  const planHit = detectPlanDocumentIntent(args.userText, args.recentMessages)
  if (planHit?.topic?.trim()) {
    return { mode: 'plan', topic: planHit.topic.trim() }
  }

  const forced = resolveForcedWebSearchQuery(args.workIntent)
  if (forced) {
    return { mode: 'web_search', query: enrichQueryForRecency(forced) }
  }

  const tfRules = detectTaskFrameRules(args.userText)
  if (tfRules.goal === 'compare') {
    return { mode: 'web_search', query: enrichQueryForRecency(args.userText.trim()) }
  }

  return null
}

export async function runWeixinStructuredTurn(args: {
  intent: WeixinStructuredIntent
  settings: AppSettings
  messages: ChatMessage[]
  userText: string
}): Promise<WeixinStructuredTurnResult> {
  const contextMessages = toContextMessages(args.messages)
  const userQuestion = lastUserMessageFromContext(contextMessages) || args.userText.trim()

  if (args.intent.mode === 'knowledge') {
    log.info('knowledge card', { topic: args.intent.topic })
    const out = await synthesizeKnowledgeAnswer(args.settings, contextMessages, {
      topic: args.intent.topic,
      userQuestion
    })
    return {
      companionReply: out.companionReply,
      cardBody: out.cardBody,
      displayTitle: out.displayTitle,
      kind: 'knowledge'
    }
  }

  if (args.intent.mode === 'plan') {
    log.info('plan document', { topic: args.intent.topic })
    const out = await synthesizePlanDocument(args.settings, contextMessages, {
      topic: args.intent.topic,
      userQuestion
    })
    return {
      companionReply: out.companionReply,
      cardBody: out.cardBody,
      displayTitle: out.displayTitle,
      kind: 'plan'
    }
  }

  log.info('web search', { query: args.intent.query })
  const taskFrame = await resolveUserTaskFrame(args.settings, args.userText)
  const candidates = buildAckemAwareSearchQueries(
    args.userText,
    buildSearchCandidateQueries(args.userText, [args.intent.query], taskFrame.searchQuery)
  )

  const outcome = await runIntentAwareWebSearch(args.settings, {
    userMessage: args.userText,
    candidateQueries: candidates
  })

  const displayQuery =
    outcome.query || outcome.intent.displayLabel || outcome.intent.searchQuery || args.intent.query

  const synth = await synthesizeSearchExperience(
    args.settings,
    contextMessages,
    {
      query: displayQuery,
      results: outcome.results,
      error: outcome.error,
      intentSummary: outcome.intent.intentSummary,
      taskFrame
    },
    {}
  )

  const kind: WeixinDocumentKind =
    taskFrame.delivery === 'markdown_table' ? 'table' : 'search'

  return {
    companionReply: synth.companionReply,
    cardBody: synth.cardBody,
    displayTitle: synth.displayTitle,
    kind
  }
}
