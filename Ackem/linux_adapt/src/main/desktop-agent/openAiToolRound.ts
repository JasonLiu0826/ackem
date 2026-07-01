import type { WebContents } from 'electron'
import type { AppSettings } from '../settings'
import type { ActionContext } from '../engine/actionExecutor'
import type { PrefetchedFact } from '../memory/ingest'
import type { UserTaskFrame } from '../../shared/taskFrame'
import { executeToolCall } from '../engine/actionExecutor'
import {
  executeSkillToolCall,
  isSkillToolName
} from '../chatSkillTools'
import { runIntentAwareSearchPresentation } from '../extensions/plugins/builtin/knowledge-presentation/presentation/intentAwareWebSearchPresentation'
import { runWebSearchWithTaskFrame } from '../taskFrame'
import { skillToolActivityLabel, desktopAgentActivityLabel } from '../chatStatusLabels'
import { parseUseComputerArgs, USE_COMPUTER_TOOL_NAME } from './toolDef'
import { executeUseComputer } from './router'
import type { ToolCallAcc } from '../openAiSseStream'

export type OpenAiToolBatchResult = {
  toolResults: Array<{ name: string; content: string }>
  writes: string[]
  prefetchedFacts: PrefetchedFact[]
  skipLlmExtraction: boolean
  webSearchCompanionReply: string | null
  invoked: string[]
}

/** 执行一轮 OpenAI tool_calls（含 use_computer / skills / read_file 等） */
export async function executeOpenAiToolBatch(args: {
  sorted: Array<[number, ToolCallAcc]>
  settings: AppSettings
  dataRoot: string
  webContents: WebContents
  sessionId: string
  allMsgs: Array<{ role: string; content: unknown }>
  userMsg: string
  userTaskFrame?: UserTaskFrame
  actionCtx: ActionContext | null
  taskPlanId?: string
  background?: boolean
}): Promise<OpenAiToolBatchResult> {
  const toolResults: Array<{ name: string; content: string }> = []
  const writes: string[] = []
  const prefetchedFacts: PrefetchedFact[] = []
  let skipLlmExtraction = false
  let webSearchCompanionReply: string | null = null

  const webSearchQueries: string[] = []
  for (const [, tc] of args.sorted) {
    if (tc.name !== 'web_search') continue
    try {
      const parsed = JSON.parse(tc.arguments || '{}') as { query?: string }
      const q = typeof parsed.query === 'string' ? parsed.query.trim() : ''
      if (q) webSearchQueries.push(q)
    } catch {
      /* ignore */
    }
  }

  let webSearchMerged = false
  if (webSearchQueries.length > 0) {
    const merged = await runWebSearchWithTaskFrame(
      args.webContents,
      args.settings,
      args.allMsgs,
      args.userMsg,
      webSearchQueries,
      args.userTaskFrame
    )
    if (merged) {
      webSearchMerged = true
      webSearchCompanionReply = merged.companionReply
      toolResults.push({
        name: 'web_search',
        content: '检索摘录纸面卡已生成（见聊天区上方卡片）。请用伴侣口吻简短回应，勿重复卡片全文。'
      })
      writes.push(merged.memoryWrite)
    }
  }

  for (const [, tc] of args.sorted) {
    if (tc.name === 'append_memory') {
      try {
        const parsed = JSON.parse(tc.arguments || '{}') as Record<string, unknown>
        if (!args.actionCtx) {
          writes.push('SKIP append_memory: no context')
          continue
        }
        const result = await executeToolCall('append_memory', parsed, args.actionCtx)
        const pathRel = typeof parsed.path_rel === 'string' ? parsed.path_rel : 'append_memory'
        if (result.success) writes.push(`OK ${pathRel}`)
        else if (result.summary.includes('信任门控')) writes.push('SKIP trust append_memory')
        else writes.push(`SKIP ${pathRel}: ${result.content}`)
      } catch {
        writes.push('SKIP: invalid tool JSON')
      }
    } else if (tc.name === 'read_file') {
      try {
        const parsed = JSON.parse(tc.arguments || '{}') as Record<string, unknown>
        if (!args.actionCtx) {
          toolResults.push({ name: 'read_file', content: '缺少会话上下文' })
          writes.push('SKIP read_file: no context')
          continue
        }
        const result = await executeToolCall('read_file', parsed, args.actionCtx)
        toolResults.push({ name: 'read_file', content: result.content })
        const path = typeof parsed.path === 'string' ? parsed.path : 'read_file'
        if (result.success) writes.push(`OK read ${path}`)
        else if (result.summary.includes('信任门控')) writes.push('SKIP trust read_file')
        else writes.push(`SKIP ${path}: ${result.content}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toolResults.push({ name: 'read_file', content: `读取失败：${msg}` })
        writes.push(`SKIP read_file: ${msg}`)
      }
    } else if (tc.name === 'extract_facts') {
      try {
        const parsed = JSON.parse(tc.arguments || '{}') as {
          facts?: Array<{ subject?: string; summary?: string; domain?: string; subcategory?: string }>
        }
        if (parsed.facts?.length) {
          for (const f of parsed.facts) {
            if (f.subject && f.summary) {
              prefetchedFacts.push({
                domain: f.domain ?? 'IDENTITY',
                subcategory: f.subcategory ?? 'NOTE',
                subject: f.subject,
                summary: f.summary
              })
              writes.push(`FACT ${f.subject}: ${f.summary}`)
            }
          }
          skipLlmExtraction = true
        }
        toolResults.push({ name: 'extract_facts', content: '已提取' })
      } catch {
        writes.push('SKIP extract_facts: invalid JSON')
      }
    } else if (tc.name === USE_COMPUTER_TOOL_NAME) {
      try {
        const parsedArgs = JSON.parse(tc.arguments || '{}') as Record<string, unknown>
        const parsed = parseUseComputerArgs(parsedArgs)
        if (!parsed) {
          toolResults.push({ name: USE_COMPUTER_TOOL_NAME, content: '参数无效' })
          writes.push('SKIP use_computer: invalid args')
          continue
        }
        const statusChannel = args.background ? 'desktop-agent:job-status' : 'chat:status'
        const statusPayload = args.background
          ? { sessionId: args.sessionId, label: desktopAgentActivityLabel(parsed.action) }
          : desktopAgentActivityLabel(parsed.action)
        args.webContents.send(statusChannel, statusPayload)
        const result = await executeUseComputer(parsed, {
          settings: args.settings,
          dataRoot: args.dataRoot,
          webContents: args.webContents,
          sessionId: args.sessionId,
          taskPlanId: args.taskPlanId,
          background: args.background
        })
        toolResults.push({ name: USE_COMPUTER_TOOL_NAME, content: result.content })
        if (result.success) writes.push(`OK use_computer: ${result.summary}`)
        else writes.push(`SKIP use_computer: ${result.summary}`)
        if (result.memoryHint) writes.push(`HINT ${result.memoryHint}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toolResults.push({ name: USE_COMPUTER_TOOL_NAME, content: `执行失败：${msg}` })
        writes.push(`SKIP use_computer: ${msg}`)
      }
    } else if (tc.name && isSkillToolName(tc.name)) {
      try {
        const parsed = JSON.parse(tc.arguments || '{}') as Record<string, unknown>
        if (tc.name === 'web_search') {
          if (webSearchMerged) continue
          const q = typeof parsed.query === 'string' ? parsed.query.trim() : ''
          const presented = await runIntentAwareSearchPresentation(
            args.webContents,
            args.settings,
            args.allMsgs,
            {
              candidateQueries: [q, args.userTaskFrame?.searchQuery].filter(
                (item): item is string => !!item?.trim()
              ),
              taskFrame: args.userTaskFrame
            },
            (text) => args.webContents.send('chat:status', text)
          )
          webSearchCompanionReply = presented.companionReply
          toolResults.push({
            name: 'web_search',
            content: '检索摘录纸面卡已生成（见聊天区上方卡片）。请用伴侣口吻简短回应，勿重复卡片全文。'
          })
          writes.push(presented.memoryWrite)
        } else {
          args.webContents.send('chat:status', skillToolActivityLabel(tc.name))
          const content = await executeSkillToolCall(tc.name, parsed, args.userMsg)
          toolResults.push({
            name: tc.name,
            content: content ?? `Skill「${tc.name}」无返回`
          })
          writes.push(content ? `OK ${tc.name}` : `SKIP ${tc.name}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toolResults.push({ name: tc.name!, content: `执行失败：${msg}` })
        writes.push(`SKIP ${tc.name}: ${msg}`)
      }
    }
  }

  const invoked = args.sorted.map(([, tc]) => tc.name).filter(Boolean) as string[]
  return {
    toolResults,
    writes,
    prefetchedFacts,
    skipLlmExtraction,
    webSearchCompanionReply,
    invoked
  }
}

export function shouldContinueDesktopAgentLoop(
  agentActive: boolean,
  agentRound: number,
  maxRounds: number,
  sorted: Array<[number, ToolCallAcc]>
): boolean {
  if (!agentActive || agentRound >= maxRounds - 1) return false
  return sorted.some(([, tc]) => tc.name === USE_COMPUTER_TOOL_NAME)
}
