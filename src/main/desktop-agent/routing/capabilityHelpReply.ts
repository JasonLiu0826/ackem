import type { AppSettings } from '../../settings'
import type { DesktopAgentSettingsSlice } from '../../../shared/desktopAgent'
import { listDesktopAgentCapabilities } from '../../../shared/desktopAgentCapabilityHint'
import { buildLlmHeaders, resolveChatCompletionsUrl } from '../../llmEndpoint'
import { readOpenAiChatCompletionStream } from '../../openAiSseStream'
import { anthropicMessagesJson } from '../../anthropicMessages'
import { finalizePaperCardCompanionReply } from '../../paperCard/finalizeCompanionReply'

function formatCapabilityLines(settings: DesktopAgentSettingsSlice): string {
  return listDesktopAgentCapabilities(settings)
    .map((line) =>
      line.enabled
        ? `- ${line.label}锛?{line.detail}`
        : `- ${line.label}锛堝綋鍓嶆湭寮€锛夛細${line.detail}`
    )
    .join('\n')
}

export async function synthesizeCapabilityHelpReply(
  settings: AppSettings,
  userQuery: string,
  signal: AbortSignal
): Promise<string> {
  const capabilities = formatCapabilityLines(settings)
  const messages = [
    {
      role: 'system' as const,
      content:
        '浣犳槸 Ackem锛岀敤鎴风殑 AI 浼翠荆銆傜敤鎴烽棶鐢佃剳鍔╂墜鑳藉仛浠€涔堛€? +
        '鐢ㄨ嚜鐒朵腑鏂囦粙缁嶄笅鍒楀凡寮€鏀?鏈紑鏀捐兘鍔涳紝缁?1~2 涓叿浣撲緥瀛愶紝淇濇寔浜鸿锛屼笉瑕佸爢 action 鍚嶆垨璺緞銆? +
        '鏈爣娉ㄣ€屽綋鍓嶆湭寮€銆嶇殑鍙互涓句緥锛涙爣娉ㄦ湭寮€鐨勮璇存槑闇€鍦ㄨ缃噷寮€鍚€?
    },
    {
      role: 'user' as const,
      content: `鐢ㄦ埛闂锛?{userQuery}\n\n褰撳墠鑳藉姏娓呭崟锛歕n${capabilities}`
    }
  ]

  let text = ''
  if ((settings.llmProvider ?? 'openai') === 'anthropic') {
    text = await anthropicMessagesJson({
      settings,
      messages,
      temperature: 0.5,
      max_tokens: 1024
    })
  } else {
    const url = resolveChatCompletionsUrl(settings)
    const res = await fetch(url, {
      method: 'POST',
      headers: buildLlmHeaders(settings),
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.5
      }),
      signal
    })
    if (!res.ok || !res.body) {
      return `鎴戝彲浠ュ府浣犲湪鏈満涓婃煡鎵?鏁寸悊鏂囦欢銆佽鏂囨。銆佹帶鍒跺簲鐢ㄧ瓑銆傚綋鍓嶅凡寮€鏀撅細\n${capabilities}`
    }
    text = await readOpenAiChatCompletionStream(
      { send: () => {} } as never,
      res,
      { streamToUi: false, pacedSentences: false, signal }
    )
  }
  return finalizePaperCardCompanionReply(text.trim())
}
