import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ClassifyClient } from './classifyIntent'

const ACKEM_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const VENDOR_STANDALONE = join(ACKEM_ROOT, 'vendor/ackemcode/data/settings.standalone.json')
const SIBLING_STANDALONE = join(ACKEM_ROOT, '../AckemCode/data/settings.standalone.json')

export type DeepseekLiveConfig = {
  apiBaseUrl: string
  apiKey: string
  model: string
}

export function loadAckemCodeDeepseek(): DeepseekLiveConfig | null {
  const override = process.env.ACKEMCODE_STANDALONE
  const path =
    override && existsSync(override)
      ? override
      : existsSync(VENDOR_STANDALONE)
        ? VENDOR_STANDALONE
        : SIBLING_STANDALONE
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      apiBaseUrl?: string
      apiKey?: string
      model?: string
    }
    const apiKey = raw.apiKey?.trim() ?? ''
    const apiBaseUrl = (raw.apiBaseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '')
    const model = raw.model?.trim() || 'deepseek-flash'
    if (!apiKey || apiKey.includes('smoke') || apiKey.includes('dummy')) return null
    return { apiBaseUrl, apiKey, model }
  } catch {
    return null
  }
}

export function maskKey(key: string): string {
  if (key.length < 8) return '(short)'
  return `${key.slice(0, 5)}…${key.slice(-4)}`
}

export function createDeepseekClassifyClient(cfg: DeepseekLiveConfig): ClassifyClient {
  return {
    async chatCompletionJson(params) {
      const res = await fetch(`${cfg.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: params.messages,
          temperature: params.temperature,
          max_tokens: params.max_tokens ?? 512,
          response_format: { type: 'json_object' }
        }),
        signal: params.signal
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`DeepSeek HTTP ${res.status} ${text.slice(0, 160)}`)
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return json.choices?.[0]?.message?.content ?? ''
    }
  }
}

const COMPANION_SYSTEM = `你是 Ackem，本地优先的桌面伴侣。用自然中文短回，像熟人，一般三到六句。
下面【本轮事实】不可违背。
对用户把 work 叫做「任务」，禁止说「工人」。停掉任务，不叫停掉工人。
禁止说已经读完文件、已经改盘、已经入库、已经开始计时，除非事实里写了已经发生。
不要报内部字段名、不要说自己是模型。确认卡用口语问一句即可。`

export async function companionReply(
  cfg: DeepseekLiveConfig,
  input: {
    userText: string
    recent?: Array<{ role: string; content: string }>
    facts: string
  }
): Promise<string> {
  const history = (input.recent ?? [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? '用户' : 'Ackem'}：${m.content}`)
    .join('\n')
  const res = await fetch(`${cfg.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: COMPANION_SYSTEM },
        {
          role: 'user',
          content: `【本轮事实】\n${input.facts}\n\n【最近】\n${history || '（无）'}\n\n【用户】\n${input.userText}`
        }
      ],
      temperature: 0.6,
      max_tokens: 400
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status} ${text.slice(0, 160)}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return (json.choices?.[0]?.message?.content ?? '').trim()
}

export async function pingDeepseek(
  cfg: DeepseekLiveConfig
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const started = Date.now()
  try {
    const res = await fetch(`${cfg.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8
      })
    })
    const latencyMs = Date.now() - started
    if (!res.ok) {
      return { ok: false, latencyMs, message: `HTTP ${res.status}` }
    }
    return { ok: true, latencyMs, message: 'ok' }
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: e instanceof Error ? e.message : String(e)
    }
  }
}
