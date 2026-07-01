// [anthropicMessages] — Claude / Anthropic Messages API（原生协议）
// 职责：URL、请求头、OpenAI 形态 messages 转换、SSE 流式解析、非流式 JSON 调用
// 引用：./settings, ./fsops, ./postChatTurn

import type { WebContents } from 'electron'
import { notifyUiChatBubble } from './uiWindow'
import type { AppSettings } from './settings'
import { appendOrOverwriteAllowed, readRelFile } from './fsops'
import { finalizeTurnAfterStream } from './postChatTurn'
import { clearPendingTurn } from './turnPending'
import {
  lastUserMessageFromContext,
  runKnowledgeAnswerChain
} from './extensions/plugins/builtin/knowledge-presentation/knowledgeAnswer'
import { runPlanDocumentViaSkill } from './extensions/skills/builtin/tool/plan-document/skillBridge'
import {
  buildToolFollowUpMessages,
  buildToolFollowUpRequestBody,
  buildToolResultsFallback
} from './toolFollowUp'
import {
  executeSkillToolCall,
  executeSkillToolCallDetailed,
  getActiveSkillToolDefs,
  isSkillToolName,
  skillDefsToAnthropicTools
} from './chatSkillTools'
import { t } from './i18n'
import { createLogger } from './logger'
import { runForcedWebSearchTurn } from './extensions/plugins/builtin/knowledge-presentation/presentation/webSearchPresentation'
import { runIntentAwareSearchPresentation } from './extensions/plugins/builtin/knowledge-presentation/presentation/intentAwareWebSearchPresentation'
import { taskFrameFollowUpActivityLabel, taskFrameWorkingActivityLabel, skillToolActivityLabel } from './chatStatusLabels'
import {
  parseUserTaskFrameFromBody,
  runWebSearchWithTaskFrame
} from './taskFrame'
import { notifyChatStreamStart } from './openAiSseStream'
import { streamChatWaves } from './chat/waveChat'
import { createPacedStreamEmitter } from './chat/pacedStreamEmitter'
import { finalizePaperCardCompanionReply } from './paperCard/finalizeCompanionReply'
import { isDesktopAgentToolingActive } from '../shared/desktopAgent'
import {
  useComputerAnthropicTool,
  parseUseComputerArgs,
  USE_COMPUTER_TOOL_NAME
} from './desktop-agent/toolDef'
import { executeUseComputer } from './desktop-agent/router'
import { desktopAgentActivityLabel } from './chatStatusLabels'
import type { ToolsPayloadOptions } from './chat'
import { tryHandleInvestigationChatTurn } from './desktop-agent/investigation/investigationChatTurn'
import {
  shouldOfferSkillToolsInDesktopAgentSession,
  shouldForceWebSearchInDesktopAgentSession
} from './desktop-agent/modePolicy'
import { runAnthropicDesktopAgentLoop } from './desktop-agent/anthropicAgentLoop'
import {
  isBackgroundAgentJobRunning,
  startBackgroundAgentJob
} from './desktop-agent/agentJobManager'
import {
  shouldRouteDesktopAgentToBackgroundJob,
  DESKTOP_AGENT_TASK_START_ACK
} from './desktop-agent/agentJobRouting'
import { isContinueTaskPlanIntent } from './desktop-agent/task-plan/taskPlanStore'

const log = createLogger('anthropic-chat')
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01'

export function resolveAnthropicMessagesUrl(settings: AppSettings): string {
  const raw = (settings.anthropicBaseUrl || '').trim() || DEFAULT_ANTHROPIC_BASE
  if (/\/messages\b/i.test(raw)) return raw.replace(/\/+$/, '')
  return `${raw.replace(/\/+$/, '')}/messages`
}

function mergeExtraHeadersJson(
  headers: Record<string, string>,
  json: string | undefined
): void {
  const extra = (json || '').trim()
  if (!extra) return
  try {
    const parsed = JSON.parse(extra) as Record<string, unknown>
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        headers[k] = String(v)
      }
    }
  } catch {
    /* ignore */
  }
}

export function buildAnthropicHeaders(settings: AppSettings): Record<string, string> {
  const key = (settings.openaiApiKey || '').trim()
  if (!key) {
    throw new Error('Anthropic 需要 API Key：请在设置中填写（与 OpenAI 兼容共用「API Key」输入框）。')
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': (settings.anthropicApiVersion || '').trim() || DEFAULT_ANTHROPIC_VERSION
  }
  mergeExtraHeadersJson(headers, settings.llmExtraHeadersJson)
  return headers
}

const appendMemoryInputSchema = {
  type: 'object',
  properties: {
    path_rel: {
      type: 'string',
      description: 'Relative path from data root, posix slashes'
    },
    content: { type: 'string' },
    mode: { type: 'string', enum: ['append', 'overwrite'] }
  },
  required: ['path_rel', 'content', 'mode']
} as const

export function anthropicAppendMemoryTool(): {
  name: string
  description: string
  input_schema: typeof appendMemoryInputSchema
} {
  return {
    name: 'append_memory',
    description:
      'Append or overwrite allowed markdown/text under the data root. Paths must start with memory/, preferences/, portrait/, diary/, companion/, or staging/.',
    input_schema: appendMemoryInputSchema
  }
}

const readFileInputSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: '文件相对路径（posix 斜杠），如 memory/notes.md' },
    max_lines: { type: 'number', description: '最大读取行数，默认 200' }
  },
  required: ['path']
} as const

function anthropicReadFileTool(): {
  name: string
  description: string
  input_schema: typeof readFileInputSchema
} {
  return {
    name: 'read_file',
    description: '读取用户数据目录中的文件内容。路径相对于 data root。',
    input_schema: readFileInputSchema
  }
}

export function anthropicAllTools(opts?: ToolsPayloadOptions): Array<{
  name: string
  description: string
  input_schema: Record<string, unknown>
}> {
  const agentActive =
    opts &&
    isDesktopAgentToolingActive(opts.settings, opts.desktopAgentChatMode === true)
  const skillTools = shouldOfferSkillToolsInDesktopAgentSession(agentActive === true)
    ? skillDefsToAnthropicTools(getActiveSkillToolDefs())
    : []
  const tools = [anthropicAppendMemoryTool(), anthropicReadFileTool(), ...skillTools]
  if (opts && isDesktopAgentToolingActive(opts.settings, opts.desktopAgentChatMode === true)) {
    tools.push(useComputerAnthropicTool())
  }
  return tools
}

type OaiMsg = { role: string; content?: unknown }

export function openAiMessagesToAnthropic(messages: unknown[]): {
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  const systemParts: string[] = []
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages as OaiMsg[]) {
    if (!m || typeof m !== 'object') continue
    if (m.role === 'system') {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
      if (c.trim()) systemParts.push(c)
      continue
    }
    if (m.role === 'user' || m.role === 'assistant') {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
      out.push({ role: m.role, content: c })
      continue
    }
    /* tool 等：当前对话拼装不包含 tool 消息；若将来有则跳过 */
  }
  return {
    system: systemParts.length ? systemParts.join('\n\n') : undefined,
    messages: out
  }
}

type ToolBlockState = { name: string; inputJson: string }

function parseSseDataLine(line: string): unknown | null {
  const t = line.replace(/\r$/, '').trim()
  if (!t.startsWith('data:')) return null
  const raw = t.slice(5).trim()
  if (!raw || raw === '[DONE]') return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

export async function streamAnthropicMessages(
  webContents: WebContents,
  body: Record<string, unknown>,
  dataRoot: string
): Promise<void> {
  const settings = body.settings as AppSettings
  const pendingTurnId = typeof body.turnId === 'string' ? body.turnId : undefined
  if (body.useWaveChat && body.wavePlan && body.waveContext) {
    return streamChatWaves(webContents, body, dataRoot)
  }
  const rawMessages = body.messages as unknown[]
  const url = resolveAnthropicMessagesUrl(settings)
  const controller = new AbortController()
  const desktopAgentChatMode = body.desktopAgentChatMode === true
  const agentActive = isDesktopAgentToolingActive(settings, desktopAgentChatMode)
  const agentTimeoutMs = agentActive ? 900_000 : settings.timeoutMs || 120_000
  const abortTimer = setTimeout(() => controller.abort(), agentTimeoutMs)
  let assistantAcc = ''
  let round1Text = ''
  const knowledgeTopic = (
    (typeof body.knowledgeTopic === 'string' ? body.knowledgeTopic : '') ||
    (typeof body.suggestedSearchQuery === 'string' ? body.suggestedSearchQuery : '')
  ).trim()
  const useKnowledgeCard = knowledgeTopic.length > 0
  const planDocumentTopic = (
    typeof body.planDocumentTopic === 'string' ? body.planDocumentTopic : ''
  ).trim()
  const usePlanDocumentCard = !useKnowledgeCard && planDocumentTopic.length > 0
  const onDelta = (s: string) => {
    round1Text += s
  }

  const { system, messages: amMsgs } = openAiMessagesToAnthropic(rawMessages)
  const ctxMsgsEarly = rawMessages as Array<{ role: string; content: unknown }>
  const maxTokens = Math.max(
    256,
    Math.min(200_000, Number(settings.anthropicMaxTokens) || 8192)
  )

  const req: Record<string, unknown> = {
    model: settings.model,
    max_tokens: maxTokens,
    messages: amMsgs,
    stream: true
  }
  // 主动策略 Loop：intensityMod 调制温度（0.5~1.5 乘到基线 0.6）
  const intensityMod = typeof body.intensityMod === 'number' ? body.intensityMod : 1.0
  req.temperature = Math.max(0.1, Math.min(1.5, 0.6 * intensityMod))
  if (system) req.system = system

  const sendTools = !settings.disableChatTools
  const toolsOpts: ToolsPayloadOptions = { settings, desktopAgentChatMode }
  const streamRound1ToUi = !useKnowledgeCard && !usePlanDocumentCard && !agentActive
  const pacedEmitter = streamRound1ToUi
    ? createPacedStreamEmitter(webContents, { signal: controller.signal })
    : undefined
  const forcedWebSearchQueryRaw = (
    typeof body.forcedWebSearchQuery === 'string' ? body.forcedWebSearchQuery : ''
  ).trim()
  const forcedWebSearchQuery = shouldForceWebSearchInDesktopAgentSession(
    agentActive,
    forcedWebSearchQueryRaw || undefined
  )
  const turnIdEarly = typeof body.turnId === 'string' ? body.turnId : undefined
  const userTaskFrame = parseUserTaskFrameFromBody(body)
  const userMsgEarly = lastUserMessageFromContext(ctxMsgsEarly)

  if (
    agentActive &&
    (await tryHandleInvestigationChatTurn({
      webContents,
      settings,
      dataRoot,
      body,
      userMsg: userMsgEarly,
      turnId: turnIdEarly,
      signal: controller.signal
    }))
  ) {
    clearTimeout(abortTimer)
    return
  }

  if (forcedWebSearchQuery) {
    try {
      await runForcedWebSearchTurn(
        webContents,
        settings,
        ctxMsgsEarly,
        forcedWebSearchQuery,
        dataRoot,
        turnIdEarly,
        userTaskFrame
      )
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  if (agentActive && !useKnowledgeCard && !usePlanDocumentCard) {
    const chatSessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default'
    if (
      userMsgEarly &&
      shouldRouteDesktopAgentToBackgroundJob(userMsgEarly, dataRoot, chatSessionId)
    ) {
      notifyChatStreamStart(webContents)
      webContents.send('chat:replace', DESKTOP_AGENT_TASK_START_ACK)
      webContents.send('chat:done', {
        memoryWrites: [],
        assistantText: DESKTOP_AGENT_TASK_START_ACK,
        turnId: turnIdEarly
      })
      notifyUiChatBubble({ text: DESKTOP_AGENT_TASK_START_ACK, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId: turnIdEarly,
        dataRoot,
        assistantText: DESKTOP_AGENT_TASK_START_ACK,
        settings
      })
      startBackgroundAgentJob({
        provider: 'anthropic',
        webContents,
        body,
        dataRoot,
        sessionId: chatSessionId,
        userText: userMsgEarly
      })
      clearTimeout(abortTimer)
      return
    }
    if (
      userMsgEarly &&
      isBackgroundAgentJobRunning(dataRoot, chatSessionId) &&
      !isContinueTaskPlanIntent(userMsgEarly)
    ) {
      const convBody = { ...body, desktopAgentChatMode: false }
      clearTimeout(abortTimer)
      return streamAnthropicMessages(webContents, convBody, dataRoot)
    }
    try {
      await runAnthropicDesktopAgentLoop(webContents, body, dataRoot)
    } catch (e) {
      if (turnIdEarly) clearPendingTurn(turnIdEarly)
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  if (useKnowledgeCard) {
    const turnIdOnly = typeof body.turnId === 'string' ? body.turnId : undefined
    try {
      const companion = await runKnowledgeAnswerChain(
        webContents,
        settings,
        ctxMsgsEarly,
        {
          topic: knowledgeTopic,
          userQuestion: lastUserMessageFromContext(ctxMsgsEarly)
        },
        (text) => webContents.send('chat:status', text)
      )
      webContents.send('chat:replace', companion)
      webContents.send('chat:done', {
        memoryWrites: [`KNOWLEDGE 整理「${knowledgeTopic}」`],
        assistantText: companion,
        turnId: turnIdOnly
      })
      notifyUiChatBubble({ text: companion, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId: turnIdOnly,
        dataRoot,
        assistantText: companion,
        settings
      })
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  if (usePlanDocumentCard) {
    const turnIdOnly = typeof body.turnId === 'string' ? body.turnId : undefined
    try {
      const companion = await runPlanDocumentViaSkill(
        webContents,
        settings,
        ctxMsgsEarly,
        {
          topic: planDocumentTopic,
          userQuestion: lastUserMessageFromContext(ctxMsgsEarly)
        },
        (text) => webContents.send('chat:status', text)
      )
      webContents.send('chat:replace', companion)
      webContents.send('chat:done', {
        memoryWrites: [`PLAN 计划书「${planDocumentTopic}」`],
        assistantText: companion,
        turnId: turnIdOnly
      })
      notifyUiChatBubble({ text: companion, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId: turnIdOnly,
        dataRoot,
        assistantText: companion,
        settings
      })
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  if (sendTools) {
    req.tools = anthropicAllTools(toolsOpts)
    req.tool_choice = { type: 'auto' }
    const offered = anthropicAllTools(toolsOpts).map(t => t.name)
    log.info('chat 工具列表', {
      hasWebSearch: offered.includes('web_search'),
      tools: offered
    })
  }

  const toolBlocks = new Map<number, ToolBlockState>()
  const writes: string[] = []

  try {
    const workingLabel = taskFrameWorkingActivityLabel(userTaskFrame)
    if (workingLabel) {
      webContents.send('chat:status', workingLabel)
    }
    const headers = buildAnthropicHeaders(settings)
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: controller.signal
    })
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => res.statusText)
      webContents.send('chat:error', `Anthropic HTTP ${res.status}: ${errText.slice(0, 800)}`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let lineBuf = ''
    let streamStarted = false

    const handlePayload = (payload: unknown): boolean => {
      if (!isRecord(payload)) return true
      const typ = payload.type
      if (typ === 'error' && isRecord(payload.error)) {
        const msg = String((payload.error as { message?: string }).message ?? JSON.stringify(payload.error))
        webContents.send('chat:error', `Anthropic: ${msg}`)
        return false
      }
      if (typ === 'content_block_start' && isRecord(payload.content_block)) {
        const idx = Number(payload.index)
        const block = payload.content_block as Record<string, unknown>
        if (
          block.type === 'tool_use' &&
          typeof block.name === 'string' &&
          Number.isFinite(idx)
        ) {
          toolBlocks.set(idx, { name: block.name, inputJson: '' })
        }
        return true
      }
      if (typ === 'content_block_delta' && isRecord(payload.delta)) {
        const idx = Number(payload.index)
        const delta = payload.delta as Record<string, unknown>
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          onDelta(delta.text)
          if (streamRound1ToUi) {
            if (pacedEmitter) {
              pacedEmitter.onDelta(delta.text)
            } else {
              if (!streamStarted) {
                streamStarted = true
                notifyChatStreamStart(webContents)
              }
              webContents.send('chat:chunk', delta.text)
            }
          }
        }
        if (
          delta.type === 'input_json_delta' &&
          typeof delta.partial_json === 'string' &&
          Number.isFinite(idx)
        ) {
          const st = toolBlocks.get(idx)
          if (st) st.inputJson += delta.partial_json
        }
        return true
      }
      if (typ === 'content_block_stop') {
        const idx = Number(payload.index)
        if (!Number.isFinite(idx)) return true
        const st = toolBlocks.get(idx)
        if (st?.name === 'append_memory' && st.inputJson) {
          try {
            const args = JSON.parse(st.inputJson) as {
              path_rel?: string
              content?: string
              mode?: 'append' | 'overwrite'
            }
            if (args.path_rel && args.content !== undefined && args.mode) {
              const r = appendOrOverwriteAllowed(dataRoot, args.path_rel, args.content, args.mode)
              writes.push(r.ok ? `OK ${args.path_rel}` : `SKIP ${args.path_rel}: ${r.error}`)
            }
          } catch {
            writes.push('SKIP: invalid tool JSON')
          }
        }
        toolBlocks.delete(idx)
        return true
      }
      return true
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      lineBuf += decoder.decode(value, { stream: true })
      const parts = lineBuf.split('\n')
      lineBuf = parts.pop() ?? ''
      for (const line of parts) {
        const pl = parseSseDataLine(line)
        if (pl !== null && !handlePayload(pl)) {
          return
        }
      }
    }
    if (lineBuf.replace(/\r$/, '').trim()) {
      const pl = parseSseDataLine(lineBuf)
      if (pl !== null && !handlePayload(pl)) return
    }
    if (pacedEmitter) {
      await pacedEmitter.markDone()
    }

    const toolResults: Array<{ name: string; id?: string; content: string }> = []
    const userMsg = lastUserMessageFromContext(ctxMsgsEarly)
    let webSearchCompanionReply: string | null = null

    const webSearchQueries: string[] = []
    for (const [, st] of toolBlocks) {
      if (st.name !== 'web_search' || !st.inputJson) continue
      try {
        const args = JSON.parse(st.inputJson) as { query?: string }
        const q = typeof args.query === 'string' ? args.query.trim() : ''
        if (q) webSearchQueries.push(q)
      } catch {
        /* ignore */
      }
    }

    let webSearchMerged = false
    if (webSearchQueries.length > 0) {
      const merged = await runWebSearchWithTaskFrame(
        webContents,
        settings,
        ctxMsgsEarly,
        userMsg,
        webSearchQueries,
        userTaskFrame
      )
      if (merged) {
        webSearchMerged = true
        webSearchCompanionReply = merged.companionReply
        toolResults.push({
          name: 'web_search',
          content: '检索摘录纸面卡已生成（见聊天区上方卡片）。'
        })
        writes.push(merged.memoryWrite)
      }
    }

    for (const [idx, st] of toolBlocks) {
      if (!st.inputJson) continue
      if (st.name === 'append_memory') {
        try {
          const args = JSON.parse(st.inputJson) as {
            path_rel?: string
            content?: string
            mode?: 'append' | 'overwrite'
          }
          if (!args.path_rel || args.content === undefined || !args.mode) continue
          const r = appendOrOverwriteAllowed(dataRoot, args.path_rel, args.content, args.mode)
          writes.push(r.ok ? `OK ${args.path_rel}` : `SKIP ${args.path_rel}: ${r.error}`)
        } catch {
          writes.push('SKIP: invalid tool JSON')
        }
      } else if (st.name === 'read_file') {
        try {
          const args = JSON.parse(st.inputJson) as { path?: string; max_lines?: number }
          if (!args.path) { toolResults.push({ name: 'read_file', id: String(idx), content: '文件路径为空' }); continue }
          const maxBytes = (args.max_lines ?? 200) * 500
          const r = readRelFile(dataRoot, args.path, maxBytes)
          if (r.ok) {
            const lines = r.text.split('\n')
            const truncated = lines.slice(0, args.max_lines ?? 200).join('\n')
            toolResults.push({ name: 'read_file', id: String(idx), content: truncated })
            writes.push(`OK read ${args.path}`)
          } else {
            toolResults.push({ name: 'read_file', id: String(idx), content: `读取失败：${r.error}` })
            writes.push(`SKIP ${args.path}: ${r.error}`)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          toolResults.push({ name: 'read_file', id: String(idx), content: `读取失败：${msg}` })
          writes.push(`SKIP read_file: ${msg}`)
        }
      } else if (st.name === USE_COMPUTER_TOOL_NAME) {
        try {
          const args = JSON.parse(st.inputJson) as Record<string, unknown>
          const parsed = parseUseComputerArgs(args)
          if (!parsed) {
            toolResults.push({ name: USE_COMPUTER_TOOL_NAME, id: String(idx), content: '参数无效' })
            writes.push('SKIP use_computer: invalid args')
            continue
          }
          webContents.send('chat:status', desktopAgentActivityLabel(parsed.action))
          const result = await executeUseComputer(parsed, {
            settings,
            dataRoot,
            webContents,
            sessionId: typeof body.sessionId === 'string' ? body.sessionId : 'default'
          })
          toolResults.push({ name: USE_COMPUTER_TOOL_NAME, id: String(idx), content: result.content })
          writes.push(result.success ? `OK use_computer: ${result.summary}` : `SKIP use_computer: ${result.summary}`)
          if (result.memoryHint) writes.push(`HINT ${result.memoryHint}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          toolResults.push({ name: USE_COMPUTER_TOOL_NAME, id: String(idx), content: `执行失败：${msg}` })
          writes.push(`SKIP use_computer: ${msg}`)
        }
      } else if (isSkillToolName(st.name)) {
        try {
          const args = JSON.parse(st.inputJson) as Record<string, unknown>
          if (st.name === 'web_search') {
            if (webSearchMerged) continue
            const q = typeof args.query === 'string' ? args.query.trim() : ''
            const presented = await runIntentAwareSearchPresentation(
              webContents,
              settings,
              ctxMsgsEarly,
              {
                candidateQueries: [q, userTaskFrame?.searchQuery].filter(
                  (item): item is string => !!item?.trim()
                ),
                taskFrame: userTaskFrame
              },
              (text) => webContents.send('chat:status', text)
            )
            webSearchCompanionReply = presented.companionReply
            toolResults.push({
              name: 'web_search',
              id: String(idx),
              content: '检索摘录纸面卡已生成（见聊天区上方卡片）。'
            })
            writes.push(presented.memoryWrite)
          } else {
            webContents.send('chat:status', skillToolActivityLabel(st.name))
            const content = await executeSkillToolCall(st.name, args, userMsg)
            toolResults.push({
              name: st.name,
              id: String(idx),
              content: content ?? `Skill「${st.name}」无返回`
            })
            writes.push(content ? `OK ${st.name}` : `SKIP ${st.name}`)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          toolResults.push({ name: st.name, id: String(idx), content: `执行失败：${msg}` })
          writes.push(`SKIP ${st.name}: ${msg}`)
        }
      }
    }

    if (sendTools) {
      const invoked = toolResults.map(tr => tr.name)
      log.info('web_search 本轮是否被调用', {
        offered: anthropicAllTools(toolsOpts).some(t => t.name === 'web_search'),
        called: invoked.includes('web_search'),
        toolCalls: invoked
      })
    }

    const turnId = typeof body.turnId === 'string' ? body.turnId : undefined

    const ctxMsgs = ctxMsgsEarly

    const otherToolResults = toolResults.filter(tr => tr.name !== 'append_memory')
    if (webSearchCompanionReply) {
      assistantAcc = finalizePaperCardCompanionReply(webSearchCompanionReply)
      webContents.send('chat:replace', assistantAcc)
    } else if (otherToolResults.length > 0) {
      webContents.send('chat:status', taskFrameFollowUpActivityLabel(userTaskFrame))
      try {
        const followMsgs = buildToolFollowUpMessages(ctxMsgs, otherToolResults, userTaskFrame).filter(
          (m: { role: string }) => m.role !== 'system'
        )
        const followReq: Record<string, unknown> = {
          model: settings.model,
          max_tokens: Math.max(
            agentActive ? INVESTIGATION_SYNTHESIZE_MIN_TOKENS : 600,
            maxTokens
          ),
          messages: followMsgs,
          stream: false
        }
        if (system) followReq.system = system
        const followRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(followReq),
          signal: controller.signal
        })
        if (followRes.ok) {
          const followJson = await followRes.json() as {
            content?: Array<{ type?: string; text?: string }>
          }
          const textBlock = (followJson.content || []).find(b => b.type === 'text')
          if (textBlock?.text) {
            assistantAcc = finalizePaperCardCompanionReply(textBlock.text)
            webContents.send('chat:replace', assistantAcc)
          }
        } else {
          const errBody = await followRes.text().catch(() => '')
          console.error('[anthropic] follow-up LLM call failed', followRes.status, errBody.slice(0, 300))
        }
      } catch (e) {
        console.error('[anthropic] follow-up LLM error', e)
      }
    }

    if (otherToolResults.length > 0 && !assistantAcc) {
      assistantAcc = buildToolResultsFallback(otherToolResults)
      webContents.send('chat:replace', assistantAcc)
    } else if (otherToolResults.length === 0 && round1Text) {
      assistantAcc = round1Text
      if (!streamRound1ToUi || agentActive) {
        webContents.send('chat:replace', round1Text)
      }
    }

    if (!assistantAcc.trim()) {
      assistantAcc = t('chat.error.emptyReply')
      webContents.send('chat:replace', assistantAcc)
    }

    webContents.send('chat:done', {
      memoryWrites: writes,
      assistantText: assistantAcc,
      turnId
    })
    notifyUiChatBubble({ text: assistantAcc, role: 'assistant' })
    void finalizeTurnAfterStream({
      turnId,
      dataRoot,
      assistantText: assistantAcc,
      settings
    })
  } catch (e) {
    if (pendingTurnId) clearPendingTurn(pendingTurnId)
    webContents.send('chat:error', e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(abortTimer)
  }
}

/** 非流式：事实抽取等 */
export async function anthropicMessagesJson(params: {
  settings: AppSettings
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature: number
  max_tokens?: number
}): Promise<string> {
  return (await anthropicMessagesJsonDetailed(params)).text
}

export async function anthropicMessagesJsonDetailed(params: {
  settings: AppSettings
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature: number
  max_tokens?: number
}): Promise<{ text: string; truncated: boolean }> {
  const { settings } = params
  const url = resolveAnthropicMessagesUrl(settings)
  const { system, messages: amMsgs } = openAiMessagesToAnthropic(params.messages as unknown[])
  const cap = Math.max(256, Math.min(200_000, Number(settings.anthropicMaxTokens) || 8192))
  const maxTokens = params.max_tokens != null
    ? Math.min(Math.max(64, params.max_tokens), cap)
    : cap
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: maxTokens,
    messages: amMsgs,
    stream: false,
    temperature: params.temperature
  }
  if (system) body.system = system

  const res = await fetch(url, {
    method: 'POST',
    headers: buildAnthropicHeaders(settings),
    body: JSON.stringify(body)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`)
  const json = JSON.parse(text) as {
    content?: Array<{ type?: string; text?: string }>
    error?: { message?: string }
    stop_reason?: string
  }
  if (json.error?.message) throw new Error(json.error.message)
  const blocks = json.content ?? []
  const textBlock = blocks.find((b) => b.type === 'text')
  return {
    text: textBlock?.text ?? '',
    truncated: json.stop_reason === 'max_tokens'
  }
}
