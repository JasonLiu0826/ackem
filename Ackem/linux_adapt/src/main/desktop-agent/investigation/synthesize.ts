import type { AppSettings } from '../../settings'
import type { InvestigationReport } from '../../../shared/investigation'
import { synthesizeMaxTokens } from '../../../shared/investigation'
import { buildLlmHeaders, resolveChatCompletionsUrl } from '../../llmEndpoint'
import { readOpenAiChatCompletionStream } from '../../openAiSseStream'
import { anthropicMessagesJson } from '../../anthropicMessages'
import {
  formatFindingsFallbackReply,
  validateSynthesisAgainstFindings
} from './hallucinationGuard'
import { createLogger } from '../../logger'

const log = createLogger('investigation.synthesize')

function buildSynthesizeMessages(
  userQuery: string,
  report: InvestigationReport,
  emotionHint?: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const findingsJson = JSON.stringify(report, null, 2)
  const itemLabel = report.template === 'games' ? '游戏' : '文件'
  return [
    {
      role: 'system',
      content:
        '你是 Ackem，用户的 AI 伴侣。以下 JSON 是已完成的本机查找结果，仅可引用其中条目，不得新增名称或路径。' +
        `用自然中文输出【一条】完整回复：完整列出 findings 中全部${itemLabel}，不得省略、不得截断；` +
        '不得重复同一开场白；若 notScanned 非空，如实说明未扫位置及原因；' +
        '禁止使用「自己打开看看」「里面没扫」等敷衍句。' +
        (emotionHint ? `当前情绪措辞参考：${emotionHint}` : '')
    },
    {
      role: 'user',
      content:
        `用户问题：${userQuery}\n\n调查结果 JSON：\n${findingsJson}\n\n请直接输出完整列表与简要说明。`
    }
  ]
}

export async function synthesizeInvestigationReply(
  settings: AppSettings,
  openAiUrl: string,
  userQuery: string,
  report: InvestigationReport,
  signal: AbortSignal,
  emotionHint?: string
): Promise<string> {
  const maxTokens = synthesizeMaxTokens(report.stats.total)
  const messages = buildSynthesizeMessages(userQuery, report, emotionHint)

  try {
    let text = ''
    if ((settings.llmProvider ?? 'openai') === 'anthropic') {
      text = await anthropicMessagesJson({
        settings,
        messages,
        temperature: 0.4,
        max_tokens: maxTokens
      })
    } else {
      const res = await fetch(openAiUrl, {
        method: 'POST',
        headers: buildLlmHeaders(settings),
        body: JSON.stringify({
          model: settings.model,
          messages,
          stream: true,
          max_tokens: maxTokens,
          temperature: 0.4
        }),
        signal
      })
      if (!res.ok || !res.body) {
        log.warn('synthesize.http_fail', { status: res.status })
        return formatFindingsFallbackReply(report, userQuery)
      }
      text = await readOpenAiChatCompletionStream(
        { send: () => {} } as never,
        res,
        { streamToUi: false, pacedSentences: false, signal }
      )
    }

    const validation = validateSynthesisAgainstFindings(text, report)
    if (!validation.ok) {
      log.warn('synthesize.validation_fail', { issues: validation.issues })
      if (validation.issues.includes('possible_hallucination_with_empty_findings')) {
        return formatFindingsFallbackReply(report, userQuery)
      }
    }
    if (text.trim()) return text.trim()
  } catch (e) {
    log.warn('synthesize.error', { err: e instanceof Error ? e.message : String(e) })
  }

  return formatFindingsFallbackReply(report, userQuery)
}

/** 供无 openAiUrl 场景（Anthropic 主路径） */
export async function synthesizeInvestigationReplyAuto(
  settings: AppSettings,
  userQuery: string,
  report: InvestigationReport,
  signal: AbortSignal
): Promise<string> {
  const url = resolveChatCompletionsUrl(settings)
  return synthesizeInvestigationReply(settings, url, userQuery, report, signal)
}
