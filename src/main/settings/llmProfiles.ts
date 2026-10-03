/** v1.1.0 LLM API 配置预设 */

export type LlmProfileProvider = 'openai' | 'anthropic' | 'deepseek' | 'gemini' | 'claude' | 'local'

export interface LlmProfile {
  id: string
  name: string
  provider: LlmProfileProvider
  baseUrl: string
  model: string
  timeoutMs?: number
  apiKeyHeaderMode?: 'bearer' | 'x-api-key'
  llmExtraHeadersJson?: string
}

export const API_PROFILE_TEMPLATES: Array<{
  id: string
  name: string
  provider: LlmProfileProvider
  baseUrl: string
  model: string
  docUrl: string
}> = [
  {
    id: 'tpl-deepseek',
    name: 'DeepSeek 快速',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    docUrl: 'https://platform.deepseek.com/api-docs',
  },
  {
    id: 'tpl-gemini',
    name: 'Gemini 快速',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    docUrl: 'https://ai.google.dev/gemini-api/docs',
  },
  {
    id: 'tpl-claude',
    name: 'Claude 快速',
    provider: 'claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-haiku-latest',
    docUrl: 'https://docs.anthropic.com/en/api/getting-started',
  },
]

export const PROFILE_FOLLOW_CHAT = '__follow_chat__'

export function createProfileFromTemplate(templateId: string, customName?: string): LlmProfile | null {
  const t = API_PROFILE_TEMPLATES.find((x) => x.id === templateId)
  if (!t) return null
  return {
    id: `profile-${Date.now()}`,
    name: customName ?? t.name,
    provider: t.provider,
    baseUrl: t.baseUrl,
    model: t.model,
    timeoutMs: 120_000,
    apiKeyHeaderMode: t.provider === 'anthropic' || t.provider === 'claude' ? 'x-api-key' : 'bearer',
  }
}
