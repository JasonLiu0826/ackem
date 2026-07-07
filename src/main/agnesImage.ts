// [agnesImage] — Agnes 文生图 API 调用模块
// 职责：调用 Agnes OpenAI 兼容图片生成接口，保存结果到本地
// 参考：https://agnes-ai.com/doc/overview
// 端点：POST {baseUrl}/images/generations
// 请求：{ model, prompt, size }  ← 不支持 response_format / n
// 响应：{ data: [{ url }] }

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppSettings } from './settings'
import { createLogger } from './logger'

const log = createLogger('agnes-image')

/** 官方端点（国内可直连） */
const OFFICIAL_BASE = 'https://apihub.agnes-ai.com/v1'

export type AgnesImageResult = {
  success: boolean
  imagePath?: string
  imageUrl?: string
  revisedPrompt?: string
  error?: string
}

/**
 * 解析 Agnes API 端点
 * 处理用户填了完整 /v1 或没填的情况
 */
function resolveEndpoint(userBaseUrl: string): string {
  let base = userBaseUrl.trim()

  // 空值 → 官方端点
  if (!base) return `${OFFICIAL_BASE}/images/generations`

  // 去掉末尾斜杠
  base = base.replace(/\/+$/, '')

  // 如果已经以 /v1 结尾，直接拼接路径
  if (base.endsWith('/v1')) {
    return `${base}/images/generations`
  }

  // 如果以 /v1/images/generations 结尾，直接用
  if (base.endsWith('/images/generations')) {
    return base
  }

  // 其他情况补 /v1
  return `${base}/v1/images/generations`
}

/**
 * 调用 Agnes 文生图 API
 * 官方文档：https://agnes-ai.com/doc/overview
 * 仅支持参数：model, prompt, size（不支持 response_format / n）
 */
export async function generateAgnesImage(params: {
  prompt: string
  settings: AppSettings
  dataRoot: string
  size?: string
  signal?: AbortSignal
}): Promise<AgnesImageResult> {
  const { prompt, settings, dataRoot, size = '1024x1024', signal } = params

  const apiKey = (settings.agnesApiKey || '').trim()
  const model = (settings.agnesImageModel || '').trim() || 'agnes-image-2.1-flash'

  if (!apiKey) {
    return { success: false, error: '未配置 Agnes API Key，请在设置 → 文生图 中填写' }
  }

  // 优先使用用户配置，其次用主模型的 baseUrl，最后用官方端点
  const userBaseUrl = (settings.agnesBaseUrl || '').trim()
    || (settings.openaiBaseUrl || '').trim()
    || OFFICIAL_BASE
  const endpoint = resolveEndpoint(userBaseUrl)

  log.info('calling Agnes image API', { endpoint, model, promptLen: prompt.length })

  // Agnes 标准请求体 —— 不含 response_format / n
  const body = { model, prompt, size }

  // 带超时的 fetch（生图较慢，默认 120s）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)
  const mergedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: mergedSignal
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      log.error('Agnes API error', { status: res.status, body: errText.slice(0, 300) })

      // 400 错误给出详细提示
      if (res.status === 400) {
        return {
          success: false,
          error: `请求参数错误 (400)。Agnes 文生图仅支持 model/prompt/size 参数，不支持 response_format。\n${errText.slice(0, 200)}`
        }
      }
      return { success: false, error: `Agnes API ${res.status}: ${errText.slice(0, 200)}` }
    }

    const json = (await res.json()) as {
      data?: Array<{ url?: string; revised_prompt?: string }>
    }

    const item = json.data?.[0]
    if (!item?.url) {
      return { success: false, error: 'Agnes API 未返回图片 URL' }
    }

    log.info('Agnes image generated', { url: item.url.slice(0, 100) })

    // 下载图片并保存到本地
    const imageDir = join(dataRoot, 'agnes-images')
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true })
    }

    const timestamp = Date.now()
    const hash = randomUUID().slice(0, 8)
    const fileName = `agnes_${timestamp}_${hash}.png`
    const imagePath = join(imageDir, fileName)

    try {
      const imgRes = await fetch(item.url, { signal: mergedSignal })
      if (!imgRes.ok) {
        return { success: true, imageUrl: item.url, revisedPrompt: item.revised_prompt }
      }
      const arrayBuf = await imgRes.arrayBuffer()
      writeFileSync(imagePath, Buffer.from(arrayBuf))
      log.info('image saved', { path: imagePath, size: arrayBuf.byteLength })
      return { success: true, imagePath, revisedPrompt: item.revised_prompt }
    } catch {
      return { success: true, imageUrl: item.url, revisedPrompt: item.revised_prompt }
    }
  } catch (e) {
    clearTimeout(timeoutId)
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { success: false, error: '图片生成超时（120s），请稍后重试' }
    }
    log.error('Agnes image generation failed', e)
    return { success: false, error: String(e) }
  }
}

/** 检测用户输入是否为图片生成意图 */
export function detectImageIntent(text: string): { isImage: boolean; prompt?: string } {
  const t = text.trim()

  // 直接生图指令
  const directPatterns: RegExp[] = [
    /^(?:画|画一张|帮我画|生成图片|生成一张|AI作画|来张|整一个|弄一张|出一张|做一张|画个|画一幅)\s*(.+)/i,
    /^(?:生成|画)\s*[：:]\s*(.+)/i,
    /^(?:draw|generate\s+image|generate|create\s+image|make\s+an?\s+image|paint|illustrate)\s*[:\-]?\s*(.+)/i,
    /^image\s*[:\-]\s*(.+)/i,
    /^\/(?:img|draw|image)\s+(.+)/i
  ]

  for (const p of directPatterns) {
    const m = t.match(p)
    if (m?.[1]) return { isImage: true, prompt: m[1].trim() }
  }

  // 意图检测：用户要求看照片/发照片/展示等
  const intentKeywords = [
    /发[张张照片]+/, /拍[张照片自拍]+/, /来[张照片张自拍]+/,
    /自拍/, /看看你/, /让我看看/, /展示/, /给我看/,
    /生图/, /生成图片/, /快点.*图/, /图.*给我/,
    /你在干嘛/, /你在做什么/, /你在哪/, /你在什么地方/,
    /照片/, /图片/, /画面/, /图像/,
    /send\s+(a\s+)?photo/, /show\s+me/, /selfie/, /take\s+a\s+photo/
  ]

  const hasIntent = intentKeywords.some(p => p.test(t))
  if (hasIntent) {
    // 用用户原文作为 prompt，让 LLM 生成更贴切的描述
    return { isImage: true, prompt: t }
  }

  return { isImage: false }
}
