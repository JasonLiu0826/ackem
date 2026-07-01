import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { PERMISSION_LABELS } from '../../../../shared/openforuPermissions'
import type { PluginManifest, PluginPermission, SandboxFetchInit } from '../../plugins/types'
import type { EngineSnapshot, ExtensionEvent } from '../../protocols'
import type { SandboxHostDeps } from './sandboxTypes'

const MAX_NOTIFY_BODY = 200
const MAX_FETCH_RESPONSE_BYTES = 256 * 1024
const FETCH_TIMEOUT_MS = 15_000

function assertInsideDir(resolved: string, root: string): void {
  const normRoot = normalize(root).toLowerCase()
  const normPath = normalize(resolved).toLowerCase()
  if (!normPath.startsWith(normRoot)) {
    throw new Error('路径越界：仅允许访问插件数据目录')
  }
}

function hasGrantedPermission(granted: PluginPermission[], perm: PluginPermission): boolean {
  return granted.includes(perm)
}

function permissionError(perm: PluginPermission): string {
  const label = PERMISSION_LABELS[perm as keyof typeof PERMISSION_LABELS] ?? perm
  return `缺少 ${label} 权限`
}

function sanitizeText(raw: string, maxLen: number): string {
  return raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen)
}

function assertPublicHttpsUrl(urlStr: string): URL {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    throw new Error('无效的 URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('仅支持 https URL')
  }
  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('不允许访问本地或私网地址')
  }
  return parsed
}

async function sandboxFetch(url: string, init?: SandboxFetchInit): Promise<{ ok: boolean; status: number; body: string }> {
  assertPublicHttpsUrl(url)
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') {
    throw new Error('仅支持 GET 与 POST')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method,
      headers: init?.headers,
      body: method === 'POST' ? init?.body : undefined,
      signal: controller.signal
    })

    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length > MAX_FETCH_RESPONSE_BYTES) {
      throw new Error(`响应体超过 ${MAX_FETCH_RESPONSE_BYTES} 字节上限`)
    }

    return {
      ok: response.ok,
      status: response.status,
      body: buf.toString('utf-8')
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`请求超时（${FETCH_TIMEOUT_MS}ms）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function sandboxNotify(
  deps: SandboxHostDeps,
  manifest: PluginManifest,
  title: string,
  body: string,
  silent?: boolean
): Promise<void> {
  const displayTitle = sanitizeText(`[${manifest.name}] ${title}`, 120)
  const displayBody = sanitizeText(body, MAX_NOTIFY_BODY)

  if (deps.showNotification) {
    deps.showNotification({ title: displayTitle, body: displayBody, silent })
    return
  }

  if (deps.broadcastNotify) {
    deps.broadcastNotify(`${displayTitle}: ${displayBody}`)
    return
  }

  throw new Error('系统通知不可用')
}

/** 主进程侧处理 worker 发来的 PluginSandboxApi 调用 */
export async function handleSandboxApiRequest(
  method: string,
  args: unknown[],
  pluginId: string,
  dataDir: string,
  manifest: PluginManifest,
  grantedPermissions: PluginPermission[],
  deps: SandboxHostDeps
): Promise<unknown> {
  switch (method) {
    case 'getEngineSnapshot':
      return deps.getEngineSnapshot?.() ?? null
    case 'readOwnFile': {
      const rel = String(args[0] ?? '')
      const resolved = join(dataDir, rel)
      assertInsideDir(resolved, dataDir)
      if (!existsSync(resolved)) {
        throw new Error(`文件不存在: ${rel}`)
      }
      return readFileSync(resolved, 'utf-8')
    }
    case 'writeOwnFile': {
      if (!hasGrantedPermission(grantedPermissions, 'data_write')) {
        throw new Error(permissionError('data_write'))
      }
      const rel = String(args[0] ?? '')
      const content = String(args[1] ?? '')
      const resolved = join(dataDir, rel)
      assertInsideDir(resolved, dataDir)
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(resolved, content, 'utf-8')
      return undefined
    }
    case 'log': {
      const level = String(args[0] ?? 'info')
      const message = String(args[1] ?? '')
      console.log(`[uplugin:${pluginId}] [${level}] ${message}`)
      return undefined
    }
    case 'notify': {
      if (!hasGrantedPermission(grantedPermissions, 'system_notification')) {
        throw new Error(permissionError('system_notification'))
      }
      const title = String(args[0] ?? '')
      const body = String(args[1] ?? '')
      const opts = args[2] as { silent?: boolean } | undefined
      await sandboxNotify(deps, manifest, title, body, opts?.silent)
      return undefined
    }
    case 'fetch': {
      if (!hasGrantedPermission(grantedPermissions, 'network_outbound')) {
        throw new Error(permissionError('network_outbound'))
      }
      const url = String(args[0] ?? '')
      const init = args[1] as SandboxFetchInit | undefined
      return sandboxFetch(url, init)
    }
    case 'emitEvent': {
      if (!hasGrantedPermission(grantedPermissions, 'engine_read')) {
        throw new Error(permissionError('engine_read'))
      }
      if (!deps.emitEvent) {
        throw new Error('emitEvent 网关未就绪')
      }
      const partial = args[0] as Omit<ExtensionEvent, 'id' | 'timestamp'>
      if (!partial || typeof partial !== 'object') {
        throw new Error('emitEvent 参数无效')
      }
      const fullEvent: ExtensionEvent = {
        ...partial,
        id: `uplugin-${pluginId}-${Date.now()}`,
        timestamp: new Date().toISOString()
      }
      deps.emitEvent(fullEvent)
      return undefined
    }
    default:
      throw new Error(`未知 sandbox API: ${method}`)
  }
}

export function ensurePluginDataDir(dataRoot: string, pluginId: string): string {
  const safeId = pluginId.replace(/[@/]/g, '_')
  const dir = join(dataRoot, 'openforu', 'uplugin-data', safeId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function minimalProbeSnapshot(): EngineSnapshot {
  return {
    totalTurns: 0,
    personality: { presetId: 'sandbox-probe' },
    emotion: { aff: 50, sec: 50, aro: 50, dom: 50, primaryLabel: 'neutral' },
    relationship: { trust: 50, stage: 'FAMILIAR' }
  } as EngineSnapshot
}
