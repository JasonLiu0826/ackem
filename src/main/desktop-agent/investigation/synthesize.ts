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
  const itemLabel = report.template === 'games' ? '娓告垙' : '鏂囦欢'
  return [
    {
      role: 'system',
      content:
        '浣犳槸 Ackem锛岀敤鎴风殑 AI 浼翠荆銆備互涓?JSON 鏄凡瀹屾垚鐨勬湰鏈烘煡鎵剧粨鏋滐紝浠呭彲寮曠敤鍏朵腑鏉＄洰锛屼笉寰楁柊澧炲悕绉版垨璺緞銆? +
        `鐢ㄨ嚜鐒朵腑鏂囪緭鍑恒€愪竴鏉°€戝畬鏁村洖澶嶏細瀹屾暣鍒楀嚭 findings 涓叏閮?{itemLabel}锛屼笉寰楃渷鐣ャ€佷笉寰楁埅鏂紱` +
        '涓嶅緱閲嶅鍚屼竴寮€鍦虹櫧锛涜嫢 notScanned 闈炵┖锛屽瀹炶鏄庢湭鎵綅缃強鍘熷洜锛? +
        '绂佹浣跨敤銆岃嚜宸辨墦寮€鐪嬬湅銆嶃€岄噷闈㈡病鎵€嶇瓑鏁疯鍙ャ€? +
        (emotionHint ? `褰撳墠鎯呯华鎺緸鍙傝€冿細${emotionHint}` : '')
    },
    {
      role: 'user',
      content:
        `鐢ㄦ埛闂锛?{userQuery}\n\n璋冩煡缁撴灉 JSON锛歕n${findingsJson}\n\n璇风洿鎺ヨ緭鍑哄畬鏁村垪琛ㄤ笌绠€瑕佽鏄庛€俙
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

/** 渚涙棤 openAiUrl 鍦烘櫙锛圓nthropic 涓昏矾寰勶級 */
export async function synthesizeInvestigationReplyAuto(
  settings: AppSettings,
  userQuery: string,
  report: InvestigationReport,
  signal: AbortSignal
): Promise<string> {
  const url = resolveChatCompletionsUrl(settings)
  return synthesizeInvestigationReply(settings, url, userQuery, report, signal)
}
