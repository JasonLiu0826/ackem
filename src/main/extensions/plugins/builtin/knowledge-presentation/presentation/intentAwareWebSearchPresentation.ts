// [intentAwareWebSearchPresentation] 鈥?鎰忓浘婢勬竻 鈫?鎼滅储 鈫?绛涢€?鈫?绾搁潰鍗★紙web_search 涓婚摼璺級

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../../settings'
import type { UserTaskFrame } from '../../../../../../shared/taskFrame'
import { buildSearchCandidateQueries } from './searchQueryResolver'
import { buildAckemAwareSearchQueries } from '../../../../../paperCard/AckemProductIdentity'
import { runIntentAwareWebSearch } from './searchWithIntent'
import { runSearchSynthesisChain } from './searchSynthesis'
import { lastUserMessageFromContext } from '../knowledgeAnswer'
import { publishExtensionTriggeredById } from '../../../../../extensionTriggerBus'
import { WEB_SEARCH_MANIFEST } from '../../../../skills/builtin/tool/web-search/manifest'

export type IntentAwarePresentationOutcome = {
  companionReply: string
  /** 绾搁潰鍗″睍绀烘爣棰?*/
  displayQuery: string
  /** 瀹為檯鎼滅储寮曟搸 query */
  searchQuery: string
  memoryWrite: string
}

/**
 * 婢勬竻 query 鈫?鑱旂綉鎼滅储 鈫?绛涢€夋潵婧?鈫?妫€绱㈢焊闈㈠崱 + 浼翠荆鐭瘎銆?
 */
export async function runIntentAwareSearchPresentation(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: {
    candidateQueries: string[]
    taskFrame?: UserTaskFrame
  },
  onStatus?: (text: string) => void
): Promise<IntentAwarePresentationOutcome> {
  if (input.taskFrame?.delivery !== 'markdown_table') {
    publishExtensionTriggeredById(WEB_SEARCH_MANIFEST.id)
  }
  const userMsg = lastUserMessageFromContext(contextMessages)
  const candidates = buildAckemAwareSearchQueries(
    userMsg,
    buildSearchCandidateQueries(userMsg, input.candidateQueries, input.taskFrame?.searchQuery)
  )

  const outcome = await runIntentAwareWebSearch(
    settings,
    { userMessage: userMsg, candidateQueries: candidates },
    onStatus
  )

  const displayQuery = outcome.query || outcome.intent.displayLabel || outcome.intent.searchQuery
  const searchQuery = outcome.intent.searchQuery || displayQuery

  const companionReply = await runSearchSynthesisChain(
    webContents,
    settings,
    contextMessages,
    [
      {
        query: displayQuery || '缃戦〉鎼滅储',
        results: outcome.results,
        error: outcome.error,
        intentSummary: outcome.intent.intentSummary,
        taskFrame: input.taskFrame
      }
    ],
    onStatus
  )

  const memoryWrite = outcome.error
    ? `FAIL web_search: ${outcome.error}`
    : searchQuery
      ? `OK web_search (${searchQuery})`
      : 'FAIL web_search: empty query'

  return {
    companionReply,
    displayQuery: displayQuery || searchQuery,
    searchQuery,
    memoryWrite
  }
}
