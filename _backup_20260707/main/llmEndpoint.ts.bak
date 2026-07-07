/*
 * @Author: JasonLiu 1917869590@qq.com
 * @Date: 2026-05-14 22:42:55
 * @LastEditors: JasonLiu 1917869590@qq.com
 * @LastEditTime: 2026-05-21 15:50:10
 * @FilePath: \阶段1\Github-open\Britney\src\main\llmEndpoint.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// [llmEndpoint] — 多厂商 / 本地 OpenAI 兼容端点解析与请求头
// 职责：统一 chat/completions URL 与 headers，供 chat.ts、llmClient 复用
// 引用：./settings

import type { AppSettings } from './settings'

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1'

/** 解析用于聊天/推断的 base URL（OpenAI 兼容路径） */
export function resolveActiveLlmBaseUrl(settings: AppSettings): string {
  if ((settings.llmProvider ?? 'openai') === 'anthropic') {
    return (settings.anthropicBaseUrl || '').trim() || 'https://api.anthropic.com/v1'
  }
  return (settings.openaiBaseUrl || '').trim() || DEFAULT_OPENAI_BASE
}

/** 是否为本地/局域网推理端点（知情确认文案分流） */
export function isLocalLlmEndpoint(settings: AppSettings): boolean {
  const raw = resolveActiveLlmBaseUrl(settings)
  let host = ''
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`)
    host = u.hostname.toLowerCase()
  } catch {
    return false
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  if (host.endsWith('.local')) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

/** 若用户粘贴了完整 …/chat/completions 地址则不再拼接，避免双路径 */
export function resolveChatCompletionsUrl(settings: AppSettings): string {
  const raw = (settings.openaiBaseUrl || '').trim() || DEFAULT_OPENAI_BASE
  if (/\/chat\/completions\b/i.test(raw)) {
    return raw.replace(/\/+$/, '')
  }
  return `${raw.replace(/\/+$/, '')}/chat/completions`
}

export function buildLlmHeaders(settings: AppSettings): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  const key = (settings.openaiApiKey || '').trim()
  if (key) {
    const mode = settings.apiKeyHeaderMode ?? 'bearer'
    if (mode === 'x-api-key') {
      headers['x-api-key'] = key
    } else {
      headers.Authorization = `Bearer ${key}`
    }
  }
  const extra = (settings.llmExtraHeadersJson || '').trim()
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          headers[k] = String(v)
        }
      }
    } catch {
      /* 无效 JSON 忽略，避免阻断聊天 */
    }
  }
  return headers
}

export function shouldSendTools(settings: AppSettings): boolean {
  return !settings.disableChatTools
}
