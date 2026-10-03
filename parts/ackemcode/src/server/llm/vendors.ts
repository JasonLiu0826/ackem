import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from '../settingsStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED = path.resolve(__dirname, '../../../data/llm-vendors.json')
const OVERRIDE = path.join(DATA_DIR, 'llm-vendors.json')

export type LlmVendor = {
  id: string
  name: string
  apiBaseUrl: string
  models: string[]
  contextWindows?: Record<string, number>
}

export async function loadLlmVendors(): Promise<LlmVendor[]> {
  for (const p of [OVERRIDE, BUNDLED]) {
    try {
      const raw = await fs.readFile(p, 'utf8')
      const parsed = JSON.parse(raw) as { vendors?: LlmVendor[] } | LlmVendor[]
      const list = Array.isArray(parsed) ? parsed : parsed.vendors
      if (Array.isArray(list) && list.length) return list
    } catch {
      /* try next */
    }
  }
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      apiBaseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4.1', 'gpt-4o']
    },
    {
      id: 'custom',
      name: 'Custom (OpenAI-compatible)',
      apiBaseUrl: '',
      models: []
    }
  ]
}

export async function testLlmConnection(opts: {
  apiBaseUrl: string
  apiKey: string
  model: string
}): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const base = opts.apiBaseUrl.replace(/\/$/, '')
  if (!base || !opts.apiKey || !opts.model) {
    return { ok: false, message: 'apiBaseUrl, apiKey, and model are required' }
  }
  const started = Date.now()
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8
      })
    })
    const latencyMs = Date.now() - started
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        message: `HTTP ${res.status} ${text.slice(0, 240)}`,
        latencyMs
      }
    }
    return { ok: true, message: 'ok', latencyMs }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - started
    }
  }
}
