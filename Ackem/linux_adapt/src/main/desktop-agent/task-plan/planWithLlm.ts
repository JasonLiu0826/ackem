import type { AppSettings } from '../../settings'
import { buildLlmHeaders, resolveChatCompletionsUrl } from '../../llmEndpoint'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DesktopAgentTaskPlan } from '../../../shared/desktopAgentTaskPlan'
import { normalizeLlmTaskPlan } from './normalizePlan'
import { buildJsonRepairUserMessage, extractJsonObject } from './planJsonParse'
import { createLogger } from '../../logger'

const log = createLogger('task-plan.llm')

function buildPlannerSystem(desktopPath: string): string {
  return [
    '你是 Ackem 电脑助手的任务规划器。只输出一个 JSON 对象，禁止 markdown 与任何解释文字。',
    '字段：',
    '- goalSummary: string，一句话说明用户要什么',
    '- steps: array，按顺序的步骤；每步含 id, label, action, path, options(可选)',
    `用户桌面绝对路径：${desktopPath}`,
    'path 用绝对路径或 ${DESKTOP}/相对路径。',
    'action 仅允许：mkdir, write_text, read_text, open_file, open_folder, delete_path, list_folder, search_files, copy_path, move_path, open_app',
    '删除文件夹前必须先 delete_path 删除内部文件。',
    '「打开看看/查看」优先 read_text，也可 open_file。'
  ].join('\n')
}

async function callOpenAiPlanner(
  settings: AppSettings,
  system: string,
  userText: string,
  signal: AbortSignal,
  useJsonMode: boolean
): Promise<string> {
  const url = resolveChatCompletionsUrl(settings)
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userText }
    ],
    stream: false,
    max_tokens: 1200,
    temperature: 0.15
  }
  if (useJsonMode) {
    body.response_format = { type: 'json_object' }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: buildLlmHeaders(settings),
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    log.warn('plan.openai_http_fail', { status: res.status, jsonMode: useJsonMode })
    return ''
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content ?? ''
}

async function callAnthropicPlanner(
  settings: AppSettings,
  system: string,
  userText: string
): Promise<string> {
  try {
    const { anthropicMessagesJson } = await import('../../anthropicMessages')
    return await anthropicMessagesJson({
      settings,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText }
      ],
      temperature: 0.15,
      max_tokens: 1200
    })
  } catch (e) {
    log.warn('plan.anthropic_fail', { err: e instanceof Error ? e.message : String(e) })
    return ''
  }
}

async function requestPlanRaw(
  settings: AppSettings,
  system: string,
  userText: string,
  signal: AbortSignal
): Promise<string> {
  const isAnthropic = (settings.llmProvider ?? 'openai') === 'anthropic'
  if (isAnthropic) {
    return callAnthropicPlanner(settings, system, userText)
  }
  let text = await callOpenAiPlanner(settings, system, userText, signal, true)
  if (!text.trim()) {
    text = await callOpenAiPlanner(settings, system, userText, signal, false)
  }
  return text
}

export async function planDesktopAgentTaskWithLlm(
  settings: AppSettings,
  userText: string,
  signal: AbortSignal
): Promise<DesktopAgentTaskPlan | null> {
  const desktopPath = join(homedir(), 'Desktop')
  const system = buildPlannerSystem(desktopPath)
  const planId = randomUUID()

  let rawText = await requestPlanRaw(settings, system, userText, signal)
  let raw = rawText ? extractJsonObject(rawText) : null

  if (!raw && rawText.trim()) {
    const repairUser = buildJsonRepairUserMessage(rawText)
    log.info('plan.json_repair_retry')
    rawText = await requestPlanRaw(settings, system, repairUser, signal)
    raw = rawText ? extractJsonObject(rawText) : null
  }

  if (!raw) {
    log.warn('plan.parse_fail')
    return null
  }

  return normalizeLlmTaskPlan(raw, userText, planId, desktopPath)
}
