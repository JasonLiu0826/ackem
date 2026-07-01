// [llmClient] — 非流式 OpenAI 兼容 JSON 调用
// 职责：factExtractor 等模块复用，含超时/重试/速率限制
// 引用：./settings, ./llmEndpoint, ./llmRetry

import type { AppSettings } from './settings'
import { buildLlmHeaders, resolveChatCompletionsUrl } from './llmEndpoint'
import { fetchWithRetry } from './llmRetry'
import { anthropicMessagesJsonDetailed } from './anthropicMessages'
import { isLlmMockMode } from './llmMockMode'
import { mockJsonCompletion } from './llmMockResponses'
import { resolveAssistantMessageText } from './llmAssistantText'

export type LlmJsonCompletion = {
  text: string
  /** 因 max_tokens 等原因未写完 */
  truncated: boolean
}

export function createLlmJsonClient(settings: AppSettings) {
  return {
    async chatCompletionJson(params: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      temperature: number
      max_tokens?: number
      signal?: AbortSignal
    }): Promise<string> {
      return (await this.chatCompletionJsonDetailed(params)).text
    },

    async chatCompletionJsonDetailed(params: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      temperature: number
      max_tokens?: number
      signal?: AbortSignal
    }): Promise<LlmJsonCompletion> {
      if (params.signal?.aborted) {
        throw new DOMException('操作已取消', 'AbortError')
      }
      if (isLlmMockMode()) {
        const text = mockJsonCompletion(params.messages)
        return { text, truncated: false }
      }
      if ((settings.llmProvider ?? 'openai') === 'anthropic') {
        return anthropicMessagesJsonDetailed({
          settings,
          messages: params.messages,
          temperature: params.temperature,
          max_tokens: params.max_tokens
        })
      }
      const url = resolveChatCompletionsUrl(settings)
      const body: Record<string, unknown> = {
        model: settings.model,
        messages: params.messages,
        temperature: params.temperature,
        stream: false
      }
      if (params.max_tokens != null) body.max_tokens = params.max_tokens
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: buildLlmHeaders(settings),
        body: JSON.stringify(body),
        timeoutMs: settings.timeoutMs || 120_000,
        signal: params.signal
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`LLM ${res.status}: ${text.slice(0, 400)}`)
      const json = JSON.parse(text) as {
        choices?: Array<{
          message?: { content?: string | null; reasoning_content?: string | null }
          finish_reason?: string
        }>
      }
      const choice = json.choices?.[0]
      const resolved = resolveAssistantMessageText(choice?.message)
      return {
        text: resolved,
        truncated: choice?.finish_reason === 'length',
      }
    }
  }
}
