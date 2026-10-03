import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSettings, type AppSettings } from '../settings'

export type RuntimeLlmSync = {
  ok: boolean
  source?: 'existing' | 'app' | 'ackemcode' | 'env'
  reason?: string
}

type LlmTriple = { apiBaseUrl: string; apiKey: string; model: string }

function isRealKey(key: string): boolean {
  const k = key.trim()
  if (!k) return false
  if (k.includes('smoke') || k.includes('dummy') || k === '[encrypted]') return false
  return true
}

function readStandalone(path: string): LlmTriple | null {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LlmTriple>
    const apiKey = raw.apiKey?.trim() ?? ''
    if (!isRealKey(apiKey)) return null
    return {
      apiBaseUrl: (raw.apiBaseUrl ?? 'https://api.deepseek.com').replace(/\/$/, ''),
      apiKey,
      model: raw.model?.trim() || 'deepseek-chat'
    }
  } catch {
    return null
  }
}

function writeStandalone(path: string, llm: LlmTriple): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify(
      {
        apiBaseUrl: llm.apiBaseUrl,
        apiKey: llm.apiKey,
        model: llm.model,
        llmVendorId: 'custom',
        llmSetupComplete: true
      },
      null,
      2
    ),
    'utf8'
  )
}

function activeChatBase(s: AppSettings): string {
  if ((s.llmProvider ?? 'openai') === 'anthropic') {
    return (s.anthropicBaseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '')
  }
  return (s.openaiBaseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
}

function fromAppSettings(s: AppSettings): LlmTriple | null {
  const apiKey = s.openaiApiKey?.trim() ?? ''
  if (!isRealKey(apiKey)) return null
  return {
    apiBaseUrl: activeChatBase(s),
    apiKey,
    model: s.model?.trim() || 'deepseek-chat'
  }
}

function fromAckemCodeSettings(s: AppSettings): LlmTriple | null {
  if (!s.ackemcodeIndependentLlm) return null
  const apiKey = s.ackemcodeApiKey?.trim() ?? ''
  if (!isRealKey(apiKey)) return null
  const chat = fromAppSettings(s)
  return {
    apiBaseUrl: (s.ackemcodeBaseUrl?.trim() || chat?.apiBaseUrl || activeChatBase(s)).replace(/\/$/, ''),
    apiKey,
    model: s.ackemcodeModel?.trim() || chat?.model || s.model?.trim() || 'deepseek-chat'
  }
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(path)) return out
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function fromEnvFile(codeRoot: string): LlmTriple | null {
  const envKey = process.env.LLM_E2E_API_KEY || process.env.DEEPSEEK_API_KEY
  if (isRealKey(envKey ?? '')) {
    return {
      apiBaseUrl: (process.env.LLM_E2E_API_BASE || 'https://api.deepseek.com').replace(/\/$/, ''),
      apiKey: envKey!.trim(),
      model: process.env.LLM_E2E_MODEL?.trim() || 'deepseek-v4-flash'
    }
  }
  const candidates = [
    join(codeRoot, '..', '..', '.env.llm.local'),
    join(process.cwd(), '.env.llm.local'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env.llm.local')
  ]
  for (const path of candidates) {
    const env = parseEnvFile(path)
    const apiKey = (env.LLM_E2E_API_KEY || env.DEEPSEEK_API_KEY || '').trim()
    if (!isRealKey(apiKey)) continue
    return {
      apiBaseUrl: (env.LLM_E2E_API_BASE || 'https://api.deepseek.com').replace(/\/$/, ''),
      apiKey,
      model: env.LLM_E2E_MODEL?.trim() || 'deepseek-v4-flash'
    }
  }
  return null
}

/**
 * 设置页是准的。
 * 单独配置打开且密钥有效：写入 AckemCode 那一套。
 * 否则写入 Ackem 聊天那一套（覆盖旧文件）。
 * 两边都没有真密钥时，保留已有文件，再试环境变量。
 */
export function syncRuntimeLlm(codeRoot: string): RuntimeLlmSync {
  const dest = join(codeRoot, 'data', 'settings.standalone.json')
  const existing = readStandalone(dest)
  let settings: AppSettings | null = null
  try {
    settings = loadSettings()
  } catch {
    settings = null
  }

  if (settings) {
    const own = fromAckemCodeSettings(settings)
    if (own) {
      writeStandalone(dest, own)
      return { ok: true, source: 'ackemcode' }
    }
    const app = fromAppSettings(settings)
    if (app) {
      writeStandalone(dest, app)
      return { ok: true, source: 'app' }
    }
  }

  if (existing) {
    return { ok: true, source: 'existing' }
  }
  const env = fromEnvFile(codeRoot)
  if (env) {
    writeStandalone(dest, env)
    return { ok: true, source: 'env' }
  }
  return { ok: false, reason: '任务运行时没有可用的模型密钥' }
}
