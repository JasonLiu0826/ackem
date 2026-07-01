/** OpenForU 用户扩展权限 — 共享类型与计算（JE-1a） */

export type OpenForUPermissionId =
  | 'readonly'
  | 'engine_read'
  | 'data_write'
  | 'engine_inject'
  | 'network_outbound'
  | 'system_notification'
  | 'clipboard_read'
  | 'foreground_detect'

export const DEFAULT_AUTO_PERMISSIONS: OpenForUPermissionId[] = ['readonly', 'engine_read']

export const FORBIDDEN_USER_PERMISSIONS: OpenForUPermissionId[] = [
  'clipboard_read',
  'foreground_detect'
]

/** UI 短标签（用户可见，无英文 id） */
export const PERMISSION_LABELS: Record<OpenForUPermissionId, string> = {
  readonly: '只读',
  engine_read: '读引擎',
  data_write: '写数据',
  engine_inject: '上下文注入',
  network_outbound: '联网',
  system_notification: '系统通知',
  clipboard_read: '剪贴板',
  foreground_detect: '前台窗口'
}

export const PERMISSION_DESCRIPTIONS: Record<OpenForUPermissionId, string> = {
  readonly: '读取自身数据目录',
  engine_read: '读取引擎只读快照',
  data_write: '写入插件数据目录',
  engine_inject: '向对话注入提示',
  network_outbound: '发起网络请求',
  system_notification: '发送系统通知',
  clipboard_read: '读取剪贴板',
  foreground_detect: '检测前台窗口'
}

export type PermissionRequestPayload = {
  requestId: string
  pluginId: string
  pluginName: string
  permissions: OpenForUPermissionId[]
  tier: 'T0' | 'T1' | 'T2'
  source?: 'deploy' | 'extension_center'
}

export type PermissionComputeResult = {
  granted: OpenForUPermissionId[]
  pending: OpenForUPermissionId[]
  forbidden: OpenForUPermissionId[]
}

export function normalizePermissionId(raw: string): OpenForUPermissionId | null {
  const id = raw.replace(/\s+/g, '_').toLowerCase() as OpenForUPermissionId
  if (id in PERMISSION_LABELS) return id
  return null
}

export function computePermissionState(
  requested: string[] | undefined,
  storedGranted?: string[] | undefined
): PermissionComputeResult {
  const manifestPerms = (requested ?? [])
    .map(normalizePermissionId)
    .filter((p): p is OpenForUPermissionId => p != null)

  const forbidden = manifestPerms.filter((p) => FORBIDDEN_USER_PERMISSIONS.includes(p))
  const elevated = manifestPerms.filter(
    (p) => !DEFAULT_AUTO_PERMISSIONS.includes(p) && !FORBIDDEN_USER_PERMISSIONS.includes(p)
  )

  const stored = (storedGranted ?? [])
    .map(normalizePermissionId)
    .filter((p): p is OpenForUPermissionId => p != null)

  const grantedSet = new Set<OpenForUPermissionId>([
    ...DEFAULT_AUTO_PERMISSIONS.filter((p) => manifestPerms.includes(p)),
    ...stored.filter((p) => elevated.includes(p) || DEFAULT_AUTO_PERMISSIONS.includes(p))
  ])

  const granted = [...grantedSet]
  const pending = elevated.filter((p) => !grantedSet.has(p))

  return { granted, pending, forbidden }
}

export function inferCapabilityTier(permissions: OpenForUPermissionId[]): 'T0' | 'T1' | 'T2' {
  if (
    permissions.some((p) =>
      ['network_outbound', 'system_notification', 'data_write'].includes(p)
    )
  ) {
    return 'T2'
  }
  if (permissions.includes('engine_inject')) return 'T1'
  return 'T0'
}

export function buildPermissionRequestPayload(
  requestId: string,
  pluginId: string,
  pluginName: string,
  pending: OpenForUPermissionId[],
  source?: PermissionRequestPayload['source']
): PermissionRequestPayload {
  return {
    requestId,
    pluginId,
    pluginName,
    permissions: pending,
    tier: inferCapabilityTier(pending),
    source
  }
}

export function formatPermissionDeniedError(pending: OpenForUPermissionId[]): string {
  const labels = pending.map((p) => PERMISSION_LABELS[p] ?? p).join('、')
  return `未授予权限：${labels}`
}
