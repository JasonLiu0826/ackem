// [ackemcode/llmSync] — 把 Ackem 主应用已配置的模型同步给 Ackem Code
// 只写 apiBaseUrl / apiKey / model，绝不记录密钥值。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../logger'
import { loadSettings } from '../settings'
import type { AppSettings } from '../settings'
import { ackemCodeDataDir } from './daemon'

const log = createLogger('ackemcode')

type StandaloneFile = {
  apiBaseUrl: string
  apiKey: string
  model: string
  llmVendorId?: string
  llmSetupComplete?: boolean
}

function isRealKey(key: string | undefined): boolean {
  const k = (key ?? '').trim()
  if (!k) return false
  if (k.includes('smoke') || k.includes('dummy') || k === '[encrypted]') return false
  return true
}

function activeBaseUrl(s: AppSettings): string {
  const raw =
    s.llmProvider === 'anthropic'
      ? s.anthropicBaseUrl || 'https://api.anthropic.com/v1'
      : s.openaiBaseUrl || 'https://api.deepseek.com'
  return raw.replace(/\/$/, '')
}

/** 从主应用设置推导出去给 Ackem Code 用的模型三元组 */
export function resolveLlmTriple(s: AppSettings): StandaloneFile | null {
  const apiKey = s.openaiApiKey?.trim() ?? ''
  if (!isRealKey(apiKey)) return null
  return {
    apiBaseUrl: activeBaseUrl(s),
    apiKey,
    model: s.model?.trim() || 'deepseek-chat',
    llmVendorId: s.llmProvider === 'anthropic' ? 'anthropic-compat' : 'custom',
    llmSetupComplete: true
  }
}

function readExisting(path: string): StandaloneFile | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StandaloneFile
  } catch {
    return null
  }
}

/**
 * 写 `{dataDir}/settings.standalone.json`。
 * 主应用有可用密钥时以主应用为准；主应用没配时才保留已有文件。
 */
export function syncLlmToAckemCode(): { ok: boolean; source?: 'app' | 'existing' | 'none'; reason?: string } {
  const dir = ackemCodeDataDir()
  const path = join(dir, 'settings.standalone.json')
  let triple: StandaloneFile | null = null
  try {
    triple = resolveLlmTriple(loadSettings())
  } catch (err) {
    // 非 Electron 环境（单测 / 冒烟脚本）读不到主应用设置，退回已有文件
    log.debug('读取主应用设置失败，改用已有 Ackem Code 设置', err)
    triple = null
  }

  if (!triple) {
    const existing = readExisting(path)
    if (existing && isRealKey(existing.apiKey)) {
      log.info('主应用未配置密钥，沿用 Ackem Code 自己的设置')
      return { ok: true, source: 'existing' }
    }
    log.warn('主应用与 Ackem Code 都没有可用 API Key')
    return { ok: false, source: 'none', reason: 'no_api_key' }
  }

  mkdirSync(dir, { recursive: true })
  const prev = readExisting(path)
  const same =
    prev &&
    prev.apiBaseUrl === triple.apiBaseUrl &&
    prev.apiKey === triple.apiKey &&
    prev.model === triple.model
  if (same) return { ok: true, source: 'app' }

  writeFileSync(path, JSON.stringify(triple, null, 2), { encoding: 'utf8', mode: 0o600 })
  log.info('已同步模型配置到 Ackem Code', {
    baseUrl: triple.apiBaseUrl,
    model: triple.model
  })
  return { ok: true, source: 'app' }
}
