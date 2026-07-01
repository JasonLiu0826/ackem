// [taskFrame/webSearchWithTaskFrame] — 按 Task Frame 执行单次联网搜索并呈现纸面卡

import type { WebContents } from 'electron'
import type { AppSettings } from '../settings'
import type { UserTaskFrame } from '../../shared/taskFrame'
import { runIntentAwareSearchPresentation } from '../extensions/plugins/builtin/knowledge-presentation/presentation/intentAwareWebSearchPresentation'
import { planWebSearchExecution } from './mergeWebSearch'

export type WebSearchTurnOutcome = {
  companionReply: string
  query: string
  memoryWrite: string
}

/**
 * 根据 Task Frame 与 LLM 给出的 tool call queries，经意图澄清后搜索并 synthesis。
 */
export async function runWebSearchWithTaskFrame(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  _userMsg: string,
  toolCallQueries: string[],
  taskFrame: UserTaskFrame | undefined,
  onStatus?: (text: string) => void
): Promise<WebSearchTurnOutcome | null> {
  const plan = planWebSearchExecution(taskFrame, toolCallQueries)
  if (!plan) return null

  const presented = await runIntentAwareSearchPresentation(
    webContents,
    settings,
    contextMessages,
    {
      candidateQueries: plan.candidateQueries,
      taskFrame
    },
    onStatus ?? ((text) => webContents.send('chat:status', text))
  )

  return {
    companionReply: presented.companionReply,
    query: presented.displayQuery,
    memoryWrite: presented.memoryWrite
  }
}
