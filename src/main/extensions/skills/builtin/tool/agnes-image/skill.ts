// [Agnes Image] AI 图片生成 — Skill Handler

import { createLogger } from '../../../../../logger.js'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types.js'
import { AGNES_IMAGE_MANIFEST } from './manifest.js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadSettings } from '../../../../../settings.js'
import type { AppSettings } from '../../../../../../shared/types.js'

const log = createLogger('agnes-image')

// Agnes API 配置 - 从设置读取
function getAgnesConfig(settings: AppSettings) {
  return {
    baseUrl: (settings.agnesBaseUrl || '').trim() || 'https://apihub.agnes-ai.com/v1',
    apiKey: (settings.agnesApiKey || '').trim(),
    model: (settings.agnesImageModel || '').trim() || 'agnes-image-2.1-flash'
  }
}

function resolveEndpoint(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '')
  if (base.endsWith('/v1')) return `${base}/images/generations`
  if (base.endsWith('/images/generations')) return base
  return `${base}/v1/images/generations`
}

const AGNES_TIMEOUT_MS = 120_000
const MAX_RETRIES = 2

interface AgnesImageResponse {
  data: Array<{ url: string }>
}

function getOutputDir(): string {
  const dir = join(process.cwd(), 'data', 'agnes-images')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

async function generateImage(prompt: string, size: string = '1024x1024', settings: AppSettings): Promise<{ path: string; url: string }> {
  const config = getAgnesConfig(settings)
  const endpoint = resolveEndpoint(config.baseUrl)
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log.info(`Agnes API 请求 (尝试 ${attempt}/${MAX_RETRIES})`, { endpoint, prompt: prompt.slice(0, 50), size })

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), AGNES_TIMEOUT_MS)

      // Agnes 标准请求体：仅 model + prompt + size
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: config.model, prompt, size }),
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Agnes API ${res.status}: ${body}`)
      }

      const data = (await res.json()) as AgnesImageResponse
      const url = data.data?.[0]?.url
      if (!url) throw new Error('Agnes API 未返回图片 URL')

      // 下载图片
      const imgRes = await fetch(url)
      if (!imgRes.ok) throw new Error(`图片下载失败: ${imgRes.status}`)

      const buffer = Buffer.from(await imgRes.arrayBuffer())
      const filename = `agnes_${Date.now()}_${randomUUID().slice(0, 8)}.png`
      const outputPath = join(getOutputDir(), filename)
      writeFileSync(outputPath, buffer)

      log.info('图片生成成功', { prompt: prompt.slice(0, 50), size, path: outputPath, bytes: buffer.length, attempt })

      return { path: outputPath, url }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      log.warn(`Agnes API 失败 (尝试 ${attempt}/${MAX_RETRIES})`, { error: lastError.message })

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  throw lastError || new Error('Agnes API 未知错误')
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const { prompt, size } = invocation.args as { prompt?: string; size?: string }

  if (!prompt) {
    return {
      ok: false,
      output: '缺少图片描述（prompt）',
      error: 'prompt is required',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  // 从设置读取 API 配置
  const settings = loadSettings()

  log.info('agnes_image 调用', { prompt: prompt.slice(0, 100), size })

  try {
    const result = await generateImage(prompt, size || '1024x1024', settings)

    return {
      ok: true,
      output: `图片已生成。`,
      data: {
        path: result.path,
        url: result.url,
        prompt
      },
      injectToContext: true,
      events: [],
      durationMs: Date.now() - start
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('agnes_image 调用失败', { prompt: prompt.slice(0, 100), error: msg })
    return {
      ok: false,
      output: `图片生成失败: ${msg}`,
      error: msg,
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const agnesImageSkill: SkillHandler = {
  manifest: AGNES_IMAGE_MANIFEST,
  execute
}

// 导出供其他模块使用
export { generateImage, getOutputDir }
