/**
 * Dual-path document/image delivery, aligned with vendor vision docs:
 *
 *   DeepSeek  https://api-docs.deepseek.com/zh-cn/guides/vision
 *     — deepseek-flash (and deepseek-v4-flash) accept images on user messages
 *     — Chat Completions content[]:
 *         { type:"image_url", image_url:{ url:"data:image/jpeg;base64,…", detail } }
 *         { type:"file", file_id }  or  { type:"file", file_data, filename }
 *     — detail: low | high (=original) | original | auto (=original)
 *     — JPEG/PNG/GIF/WebP; 48 MiB request; URL images ≤32 MiB
 *     — deepseek-chat / reasoner stay text-only
 *
 *   OpenAI / Azure  image_url + detail auto|low|high; data: URL or https
 *   Gemini OpenAI-compat  same image_url data: URL (natively multimodal)
 *   Qwen VL (DashScope compatible-mode)  image_url url or data:
 *   Kimi / Moonshot  image_url data: URL (content MUST be an array)
 *   GLM-4V / 4.5V / 4.6V  OpenAI-compat image_url
 *   Anthropic Messages  type:image source.base64; native PDF type:document
 *     (only on anthropic.com — OpenAI-compat Claude gateways get page JPEGs)
 *
 * Text models always get extracted text. Vision models also get page/image parts.
 */
export type MultimodalMode = 'auto' | 'off' | 'vision'

export type ImageDetail = 'low' | 'high' | 'auto' | 'original'

export type ModelMediaCaps = {
  /** OpenAI-style image_url (DeepSeek / GPT / Gemini / Qwen / Kimi / GLM …). */
  vision: boolean
  /** Anthropic document block (base64 PDF) — anthropic.com only. */
  nativePdf: boolean
  mode: MultimodalMode
  /** DeepSeek: high === original; use original for scans / small text. */
  imageDetail: ImageDetail
}

/** IDs that 400 if you send image_url. Flash is NOT in this list. */
const TEXT_ONLY_RE =
  /^(deepseek-chat|deepseek-reasoner|deepseek-coder|deepseek-v4-pro)([.-]|$)/i

const VISION_RE =
  /deepseek-flash|deepseek-v4-flash|deepseek[-._].*vision|flash-vision|gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|gpt-5|gpt-5\.|o3\b|o4-mini|claude|gemini|grok-.*vision|grok-4|qwen[-_.]?vl|qwen2(\.5)?-vl|qwen3-vl|[-_/]vl[-_/]|[-_/]vl$|pixtral|llama-4|phi-4-multimodal|internvl|glm-4(\.\d+)?v|step-1v|deepseek-vl|kimi-k2\.[6-9]|kimi-k3|kimi[-_.]?v|hunyuan-vision|qvq/i

const NATIVE_PDF_HOST_RE = /anthropic\.com/i

export function resolveMultimodalMode(
  raw?: string | null
): MultimodalMode {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'off' || v === '0' || v === 'false') return 'off'
  if (v === 'vision' || v === 'on' || v === 'true') return 'vision'
  return 'auto'
}

export function isKnownTextOnlyModel(model?: string | null): boolean {
  const m = String(model || '').trim()
  if (!m) return false
  if (isDeepSeekVisionModel(m)) return false
  return TEXT_ONLY_RE.test(m)
}

/** Official DeepSeek vision IDs (docs use deepseek-flash with image_url). */
export function isDeepSeekVisionModel(model?: string | null): boolean {
  const m = String(model || '').trim()
  if (!m) return false
  if (/vision/i.test(m) && /deepseek/i.test(m)) return true
  return /^(deepseek-flash|deepseek-v4-flash)([.-]|$)/i.test(m)
}

export function resolveModelMedia(opts: {
  model?: string
  apiBaseUrl?: string
  multimodal?: string | null
}): ModelMediaCaps {
  const mode = resolveMultimodalMode(
    opts.multimodal || process.env.ACKEM_MULTIMODAL
  )
  const model = String(opts.model || '')
  const host = String(opts.apiBaseUrl || '')
  const imageDetail: ImageDetail = isDeepSeekVisionModel(model)
    ? 'original'
    : 'high'

  if (mode === 'off') {
    return { vision: false, nativePdf: false, mode, imageDetail }
  }

  const looksClaude = /claude/i.test(model) || NATIVE_PDF_HOST_RE.test(host)
  const haiku3noPdf = /^claude-3-haiku(?!-[0-9]*[5-9])/i.test(model)
  const nativePdf =
    looksClaude && !haiku3noPdf && NATIVE_PDF_HOST_RE.test(host)

  if (isKnownTextOnlyModel(model)) {
    return { vision: false, nativePdf: false, mode, imageDetail }
  }

  const looksVision =
    mode === 'vision' ||
    VISION_RE.test(model) ||
    isDeepSeekVisionModel(model) ||
    nativePdf

  return {
    vision: looksVision,
    nativePdf,
    mode,
    imageDetail
  }
}
