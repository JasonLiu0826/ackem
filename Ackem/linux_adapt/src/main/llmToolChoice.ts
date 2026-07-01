import type { AppSettings } from './settings'

function parseExtraJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isTruthyThinkingFlag(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === 'true' || v === 'enabled' || v === 'enable' || v === 'high'
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const type = (value as { type?: unknown }).type
    if (typeof type === 'string') {
      const t = type.trim().toLowerCase()
      return t === 'enabled' || t === 'enable'
    }
  }
  return false
}

/** 当前模型/配置是否可能处于 Thinking 推理模式 */
export function llmThinkingModeLikelyActive(settings: AppSettings): boolean {
  const model = (settings.model || '').toLowerCase()
  if (/reasoner|thinking|deepseek-r1|deepseek-v4|\bo1\b|\bo3\b|qwq|qvq|-r1\b|v4-flash/.test(model)) {
    return true
  }

  const parsed = parseExtraJson(settings.llmExtraHeadersJson || '')
  if (parsed) {
    if (isTruthyThinkingFlag(parsed.enable_thinking)) return true
    if (isTruthyThinkingFlag(parsed.thinking)) return true
    if (isTruthyThinkingFlag(parsed.thinking_mode)) return true
    if (isTruthyThinkingFlag(parsed.reasoning_effort)) return true
    const kwargs = parsed.chat_template_kwargs
    if (kwargs && typeof kwargs === 'object' && !Array.isArray(kwargs)) {
      if (isTruthyThinkingFlag((kwargs as Record<string, unknown>).enable_thinking)) return true
    }
  }

  const extra = (settings.llmExtraHeadersJson || '').toLowerCase()
  if (/enable_thinking|thinking_mode|reasoning_effort|"thinking"\s*:/.test(extra)) {
    if (/:\s*true|:\s*"enabled"|:\s*"enable"|:\s*"high"/.test(extra)) return true
  }
  return false
}

/** DeepSeek / 部分推理模型在 thinking 模式下禁止 tool_choice=required */
export function llmSupportsRequiredToolChoice(settings: AppSettings): boolean {
  return !llmThinkingModeLikelyActive(settings)
}

export function isToolChoiceCompatibilityError(status: number, errText: string): boolean {
  return status === 400 && /tool_choice|thinking mode does not support/i.test(errText)
}

export function setOpenAiToolChoice(
  reqBody: Record<string, unknown>,
  choice: 'auto' | 'required',
  settings: AppSettings
): 'auto' | 'required' {
  const effective =
    choice === 'required' && !llmSupportsRequiredToolChoice(settings) ? 'auto' : choice
  reqBody.tool_choice = effective
  return effective
}

/** Agent 循环：Thinking 模式下禁止 required，仅保留 auto + 文本续跑提示 */
export function setOpenAiAgentToolChoice(
  reqBody: Record<string, unknown>,
  settings: AppSettings
): 'auto' {
  reqBody.tool_choice = 'auto'
  return 'auto'
}
