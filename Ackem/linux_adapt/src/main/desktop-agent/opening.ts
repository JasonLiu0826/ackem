import type { AppSettings } from '../settings'
import type { FullState } from '../engine/types'
import { createLlmJsonClient } from '../llmClient'

export async function generateDesktopAgentOpening(args: {
  settings: AppSettings
  state: FullState
  companionName: string
}): Promise<string> {
  const { settings, state, companionName } = args
  const emotion = state.emotion.primaryLabel ?? 'CALM_RATIONAL'
  const client = createLlmJsonClient(settings)
  const text = await client.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: `你是 ${companionName}，用户的 AI 伴侣。电脑助手模式刚开启。用一两句自然、温柔的中文主动问用户今天想在电脑上帮你做什么（例如整理文件、读文档、打开软件）。不要列技术命令，不要自称机器人。当前情绪：${emotion}。`
      },
      {
        role: 'user',
        content: '[系统] 电脑助手模式已开启，请向用户开场。'
      }
    ],
    temperature: 0.75,
    max_tokens: 120
  })
  return text.trim() || '今天想让我在电脑上帮你做点什么？'
}
