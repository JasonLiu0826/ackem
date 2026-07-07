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
    '浣犳槸 Ackem 鐢佃剳鍔╂墜鐨勪换鍔¤鍒掑櫒銆傚彧杈撳嚭涓€涓?JSON 瀵硅薄锛岀姝?markdown 涓庝换浣曡В閲婃枃瀛椼€?,
    '瀛楁锛?,
    '- goalSummary: string锛屼竴鍙ヨ瘽璇存槑鐢ㄦ埛瑕佷粈涔?,
    '- steps: array锛屾寜椤哄簭鐨勬楠わ紱姣忔鍚?id, label, action, path, options(鍙€?',
    `鐢ㄦ埛妗岄潰缁濆璺緞锛?{desktopPath}`,
    'path 鐢ㄧ粷瀵硅矾寰勬垨 ${DESKTOP}/鐩稿璺緞銆?,
    'action 浠呭厑璁革細mkdir, write_text, read_text, open_file, open_folder, delete_path, list_folder, search_files, copy_path, move_path, open_app',
    '鍒犻櫎鏂囦欢澶瑰墠蹇呴』鍏?delete_path 鍒犻櫎鍐呴儴鏂囦欢銆?,
    '銆屾墦寮€鐪嬬湅/鏌ョ湅銆嶄紭鍏?read_text锛屼篃鍙?open_file銆?
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
