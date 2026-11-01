// [qq] — NapCat WebUI 连接配置（取登录二维码用）
//
// 为什么要单独存一份：
// - 扫码发生在「还没有 QQ 账号」的时候，不能塞进 qq_account（那张表要求先有 OneBot 地址）。
// - 也不想为两个字段动 SQLite schema；写 channels/qq-webui.json 与 qq-account.json 同构。
//
// 令牌只在主进程使用：IPC 的 get 只回传 hasToken，不把明文送回渲染进程。

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** NapCat WebUI 默认地址（docker compose 里映射的 6099） */
export const QQ_WEBUI_DEFAULT_BASE = 'http://127.0.0.1:6099'

const WEBUI_CONFIG_FILE = 'channels/qq-webui.json'

export type QqWebuiConfig = {
  /** 例：http://127.0.0.1:6099（不含 /api、/webui） */
  baseUrl: string
  /** NapCat 的 WEBUI_TOKEN；空字符串表示还没填 */
  token: string
}

function webuiConfigPath(dataRoot: string): string {
  return join(dataRoot, WEBUI_CONFIG_FILE)
}

/**
 * 允许用户直接粘贴 WebUI 页面地址或 API 地址：
 * - http://127.0.0.1:6099/webui → http://127.0.0.1:6099
 * - http://127.0.0.1:6099/api   → http://127.0.0.1:6099
 */
export function normalizeWebuiBaseUrl(raw?: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return QQ_WEBUI_DEFAULT_BASE
  return trimmed
    .replace(/\/+$/, '')
    .replace(/\/webui$/i, '')
    .replace(/\/api$/i, '')
    .replace(/\/+$/, '')
}

export function isValidWebuiBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/[^\s/]+/i.test(baseUrl)
}

/** 读取配置；文件不存在或损坏时回退默认值，不让设置页报错 */
export function loadQqWebuiConfig(dataRoot: string): QqWebuiConfig {
  const path = webuiConfigPath(dataRoot)
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<QqWebuiConfig>
      const baseUrl = normalizeWebuiBaseUrl(raw.baseUrl)
      const token = typeof raw.token === 'string' ? raw.token.trim() : ''
      if (isValidWebuiBaseUrl(baseUrl)) return { baseUrl, token }
    }
  } catch {
    /* 坏文件按未配置处理，下一次保存会覆盖 */
  }
  return { baseUrl: QQ_WEBUI_DEFAULT_BASE, token: '' }
}

/**
 * 保存配置。
 * - baseUrl 省略时沿用已保存值；
 * - token 为空时沿用已保存值（设置页令牌框不回显，留空 = 不修改）。
 * 地址格式不对时抛错，由 IPC 转成可读提示。
 */
export function saveQqWebuiConfig(
  dataRoot: string,
  input: { baseUrl?: string; token?: string }
): QqWebuiConfig {
  const current = loadQqWebuiConfig(dataRoot)
  const baseUrl = normalizeWebuiBaseUrl(input.baseUrl ?? current.baseUrl)
  const token = (input.token ?? '').trim() || current.token

  if (!isValidWebuiBaseUrl(baseUrl)) {
    throw new Error('NapCat WebUI 地址格式不对，应以 http:// 或 https:// 开头')
  }

  const path = webuiConfigPath(dataRoot)
  mkdirSync(join(dataRoot, 'channels'), { recursive: true })
  writeFileSync(path, JSON.stringify({ baseUrl, token }, null, 2), 'utf-8')

  // 令牌是敏感信息，尽量只让当前用户可读（Windows 上 chmod 无效，忽略即可）
  try {
    chmodSync(path, 0o600)
  } catch {
    /* ignore */
  }

  return { baseUrl, token }
}
