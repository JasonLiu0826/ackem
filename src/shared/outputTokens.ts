import type { AppSettings } from './types'
export function isOutputTokensAutomatic(settings: Pick<AppSettings, 'outputTokensAuto'>): boolean { return settings.outputTokensAuto !== false }
export function customOutputTokens(settings: Pick<AppSettings, 'anthropicMaxTokens'>): number {
  const value = Number(settings.anthropicMaxTokens)
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 8192
}
/** OpenAI-compatible auto delegates to the server, without imposing a universal cap. */
export function openAiOutputTokenParams(settings: Pick<AppSettings, 'outputTokensAuto' | 'anthropicMaxTokens' | 'model' | 'openaiBaseUrl'>): Record<string, number> {
  if (isOutputTokensAutomatic(settings)) return {}
  const official = /^https:\/\/api\.openai\.com(?:\/|$)/i.test(settings.openaiBaseUrl || '')
  const reasoning = /^(?:o[134](?:-|$)|gpt-[56](?:[.-]|$))/i.test(settings.model || '')
  return { [official && reasoning ? 'max_completion_tokens' : 'max_tokens']: customOutputTokens(settings) }
}
