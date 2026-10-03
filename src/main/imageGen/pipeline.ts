/** v1.1.0 生图管线 — 接口预留（提示词生成下一期） */

export type ImageGenProvider = 'openai_compatible' | 'sd_webui' | 'unset'

export interface ImageGenConfig {
  enabled: boolean
  provider: ImageGenProvider
  baseUrl: string
  model: string
  apiKey: string
  defaultSize: '512x512' | '1024x1024'
  /** 下一期：LLM 提示词增强 */
  promptEnhancementEnabled: boolean
}

export interface ImageGenRequest {
  /** 用户原始意图或 LLM 提取的 prompt */
  rawPrompt: string
  /** 下一期填充：经 promptEnhancer 优化后的 prompt */
  enhancedPrompt?: string
  size?: '512x512' | '1024x1024'
}

export interface ImageGenResult {
  ok: boolean
  imagePath?: string
  error?: string
  /** 预留：实际发送给 API 的 prompt */
  usedPrompt?: string
}

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  enabled: false,
  provider: 'unset',
  baseUrl: '',
  model: '',
  apiKey: '',
  defaultSize: '1024x1024',
  promptEnhancementEnabled: false,
}

/** 下一期实现：根据对话上下文优化生图 prompt */
export function enhanceImagePrompt(_req: ImageGenRequest): string {
  return _req.rawPrompt.trim()
}

/** 生图执行入口 — v1.1.0 预留接口，未配置时返回友好错误 */
export async function runImageGeneration(
  _config: ImageGenConfig,
  req: ImageGenRequest
): Promise<ImageGenResult> {
  if (!_config.enabled || _config.provider === 'unset' || !_config.baseUrl.trim()) {
    return {
      ok: false,
      error: '生图 API 尚未配置。请在 设置 → 生图 中填写接口后再试。',
    }
  }

  const usedPrompt = _config.promptEnhancementEnabled
    ? enhanceImagePrompt(req)
    : req.rawPrompt.trim()

  if (!usedPrompt) {
    return { ok: false, error: '缺少生图描述' }
  }

  // 下一期：OpenAI /images/generations 或 SD WebUI txt2img
  return {
    ok: false,
    error: '生图执行器尚未接入所选模型，接口已预留。请在下一版本配置具体 provider 实现。',
    usedPrompt,
  }
}
