// [webSearchPresentation] — web_search Skill 结果 → 检索摘录纸面卡

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../../settings'
import type { SearchResult } from './search'
import type { SkillResult } from '../../../../skills/types'
import { runSearchSynthesisChain } from './searchSynthesis'
import { lastUserMessageFromContext } from '../knowledgeAnswer'
import { finalizeTurnAfterStream } from '../../../../../postChatTurn'
import { notifyUiChatBubble } from '../../../../../uiWindow'
import { createLogger } from '../../../../../logger'
import type { UserTaskFrame } from '../../../../../../shared/taskFrame'
import { runIntentAwareSearchPresentation } from './intentAwareWebSearchPresentation'

const log = createLogger('web-search-presentation')

export async function presentWebSearchCard(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  skillResult: SkillResult,
  query: string,
  taskFrame?: UserTaskFrame
): Promise<string> {
  const data = skillResult.data as {
    results?: SearchResult[]
    engine?: string
  } | undefined

  const results = data?.results ?? []
  const error = skillResult.ok ? undefined : (skillResult.error ?? '搜索失败')

  return runSearchSynthesisChain(
    webContents,
    settings,
    contextMessages,
    [{ query: query || '网页搜索', results, error, taskFrame }],
    (text) => webContents.send('chat:status', text)
  )
}

/** L0.5 显式「帮我搜/查」：规则层立即联网，跳过 LLM 首轮是否调 tool 的博弈 */
export async function runForcedWebSearchTurn(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  query: string,
  dataRoot: string,
  turnId?: string,
  taskFrame?: UserTaskFrame
): Promise<void> {
  log.info('web_search 规则层强制触发', { query, turnId })

  const presented = await runIntentAwareSearchPresentation(
    webContents,
    settings,
    contextMessages,
    {
      candidateQueries: [query, taskFrame?.searchQuery].filter((q): q is string => !!q?.trim()),
      taskFrame
    },
    (text) => webContents.send('chat:status', text)
  )

  webContents.send('chat:replace', presented.companionReply)
  webContents.send('chat:done', {
    memoryWrites: [presented.memoryWrite],
    assistantText: presented.companionReply,
    turnId
  })
  notifyUiChatBubble({ text: presented.companionReply, role: 'assistant' })
  void finalizeTurnAfterStream({
    turnId,
    dataRoot,
    assistantText: presented.companionReply,
    settings
  })
}
