/** OpenForU 用户自创扩展 — 扩展中心展示用 */

export type OpenForUExtensionKind = 'uskill' | 'uplugin'

export type OpenForUExtensionRow = {
  kind: OpenForUExtensionKind
  manifest: {
    id: string
    name: string
    description: string
    version: string
    tags?: string[]
    dispatch?: {
      mode: string
      summary: string
      habits?: string[]
      scenarios?: string[]
      keywords?: string[]
    }
  }
  status: 'installed' | 'active' | 'disabled' | 'error'
  runnable: boolean
  dirPath: string
  lastError?: string
  pendingPermissions?: string[]
  /** uplugin 是否声明 Surface（plugin.meta.json · surface.enabled） */
  hasSurface?: boolean
}

export function isUserExtensionId(id: string): boolean {
  return id.startsWith('u/')
}

/** 从 u/slug@version 推断 openforu 磁盘目录（展示用） */
export function guessUserExtensionDirPath(id: string, kind: OpenForUExtensionKind): string {
  const slug = id.replace(/^u\//, '').replace(/@.*$/, '')
  return `data/openforu/${kind === 'uskill' ? 'uskills' : 'uplugins'}/${slug}`
}
