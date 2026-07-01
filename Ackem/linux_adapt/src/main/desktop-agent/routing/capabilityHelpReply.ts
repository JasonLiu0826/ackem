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
        ? `- ${line.label}：${line.detail}`
        : `- ${line.label}（当前未开）：${line.detail}`
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
        '你是 Ackem，用户的 AI 伴侣。用户问电脑助手能做什么。' +
        '用自然中文介绍下列已开放/未开放能力，给 1~2 个具体例子，保持人设，不要堆 action 名或路径。' +
        '未标注「当前未开」的可以举例；标注未开的要说明需在设置里开启。'
    },
    {
      role: 'user' as const,
      content: `用户问题：${userQuery}\n\n当前能力清单：\n${capabilities}`
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
      return `我可以帮你在本机上查找/整理文件、读文档、控制应用等。当前已开放：\n${capabilities}`
    }
    text = await readOpenAiChatCompletionStream(
      { send: () => {} } as never,
      res,
      { streamToUi: false, pacedSentences: false, signal }
    )
  }
  return finalizePaperCardCompanionReply(text.trim())
}
