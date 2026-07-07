/*
 * @Author: JasonLiu 1917869590@qq.com
 * @Date: 2026-05-14 22:42:55
 * @LastEditors: JasonLiu 1917869590@qq.com
 * @LastEditTime: 2026-05-21 15:50:10
 * @FilePath: \闃舵1\Github-open\Ackem\src\main\llmEndpoint.ts
 * @Description: 杩欐槸榛樿璁剧疆,璇疯缃甡customMade`, 鎵撳紑koroFileHeader鏌ョ湅閰嶇疆 杩涜璁剧疆: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// [llmEndpoint] 鈥?澶氬巶鍟?/ 鏈湴 OpenAI 鍏煎绔偣瑙ｆ瀽涓庤姹傚ご
// 鑱岃矗锛氱粺涓€ chat/completions URL 涓?headers锛屼緵 chat.ts銆乴lmClient 澶嶇敤
// 寮曠敤锛?/settings

import type { AppSettings } from './settings'

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1'

/** 瑙ｆ瀽鐢ㄤ簬鑱婂ぉ/鎺ㄦ柇鐨?base URL锛圤penAI 鍏煎璺緞锛?*/
export function resolveActiveLlmBaseUrl(settings: AppSettings): string {
  if ((settings.llmProvider ?? 'openai') === 'anthropic') {
    return (settings.anthropicBaseUrl || '').trim() || 'https://api.anthropic.com/v1'
  }
  return (settings.openaiBaseUrl || '').trim() || DEFAULT_OPENAI_BASE
}

/** 鏄惁涓烘湰鍦?灞€鍩熺綉鎺ㄧ悊绔偣锛堢煡鎯呯‘璁ゆ枃妗堝垎娴侊級 */
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

/** 鑻ョ敤鎴风矘璐翠簡瀹屾暣 鈥?chat/completions 鍦板潃鍒欎笉鍐嶆嫾鎺ワ紝閬垮厤鍙岃矾寰?*/
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
      /* 鏃犳晥 JSON 蹇界暐锛岄伩鍏嶉樆鏂亰澶?*/
    }
  }
  return headers
}

export function shouldSendTools(settings: AppSettings): boolean {
  return !settings.disableChatTools
}
