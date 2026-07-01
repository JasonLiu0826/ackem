import type { AppSettings } from './types'

export const OPENFORU_NOT_CONFIGURED_MSG =
  '请先在设置中配置 OpenForU 专用模型的 Base URL 与 Model ID。'

/** 质量优先：Plan 单轮输出上限（固定 128k，不可在设置中修改） */
export const OPENFORU_DEFAULT_MAX_TOKENS = 128_000

/** 质量优先：生成 / Evolve 阶段上下文与单步输出上限 */
export const OPENFORU_QUALITY = {
  planDialogueExcerptChars: 12_000,
  planDialogueExcerptMessages: 24,
  polishMaxTokens: 8192,
  upluginCodeMaxTokens: 16_384,
  evolveUskillMaxTokens: 8192,
  upluginEvolveMaxTokens: 32_768
} as const

export type PlanDialogueExcerptSession = {
  messages: Array<{ role: string; content: string }>
}

/** 生成阶段注入 LLM 的 Plan 对话摘录（质量优先：更长、更多轮） */
export function buildPlanDialogueExcerpt(
  session: PlanDialogueExcerptSession,
  opts?: { maxChars?: number; maxMessages?: number }
): string {
  const maxChars = opts?.maxChars ?? OPENFORU_QUALITY.planDialogueExcerptChars
  const maxMessages = opts?.maxMessages ?? OPENFORU_QUALITY.planDialogueExcerptMessages
  return session.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxMessages)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n')
    .slice(-maxChars)
}

export function isOpenForUConfigured(
  settings: Pick<AppSettings, 'openforuBaseUrl' | 'openforuModel'> | null | undefined
): boolean {
  if (!settings) return false
  return Boolean(settings.openforuBaseUrl?.trim()) && Boolean(settings.openforuModel?.trim())
}

export function clampOpenForUTemperature(value: number | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.2
  return Math.min(2, Math.max(0, Math.round(n * 100) / 100))
}

/** OpenForU Plan 单轮 max_tokens（固定值，忽略传入参数） */
export function getOpenForUMaxTokens(): number {
  return OPENFORU_DEFAULT_MAX_TOKENS
}

export function clampOpenForUMaxTokens(_value?: number): number {
  return OPENFORU_DEFAULT_MAX_TOKENS
}

/** 将 OpenForU 专用字段映射为 LLM 客户端设置；不回落聊天模型的 URL / Model / Key。 */
/** AC-0 验收后默认开启；显式设为 false 可回退旧 deploy 路径 */
export function isOpenForUAgentCoreEnabled(
  settings: Pick<AppSettings, 'openforuAgentCoreEnabled'> | null | undefined
): boolean {
  return settings?.openforuAgentCoreEnabled === true
}

export function buildOpenForULlmSettings(base: AppSettings): AppSettings | null {
  const url = (base.openforuBaseUrl || '').trim()
  const model = (base.openforuModel || '').trim()
  if (!url || !model) return null
  return {
    ...base,
    llmProvider: 'openai',
    openaiBaseUrl: url,
    openaiApiKey: (base.openforuApiKey || '').trim(),
    model,
    timeoutMs: Math.max(base.timeoutMs || 120_000, 180_000)
  }
}
