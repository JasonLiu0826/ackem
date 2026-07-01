/** 与 manifest.dispatch 对齐的展示用类型（renderer 侧） */
import { isCoreExtension } from '../../../shared/coreExtensions'

export type DispatchConfigView = {
  mode: string
  summary: string
  habits?: string[]
  scenarios?: string[]
  keywords?: string[]
}

/** 扩展中心卡片 / 详情共用字段 */
export type ExtensionItem = {
  id: string
  name: string
  description: string
  version: string
  status: 'planned' | 'deprecated' | 'active' | 'installed' | 'disabled' | 'error'
  /** 实装完成度：stub=预览级，非完整能力（FIX-026） */
  implementationStatus?: 'complete' | 'stub' | 'preview' | 'planned' | 'deprecated'
  /** 是否有运行时实现，可 activate */
  runnable?: boolean
  builtin?: boolean
  /** OpenForU 用户自创 */
  origin?: 'uskill' | 'uplugin'
  tags?: string[]
  dispatch?: DispatchConfigView
  readme?: string
  dirPath?: string
  pendingPermissions?: string[]
  lastError?: string
  /** uplugin 是否带 Surface 独立窗口 */
  hasSurface?: boolean
}

export function isCoreExtensionItem(item: ExtensionItem): boolean {
  return isCoreExtension(item.id)
}

export function extensionStatusLabel(item: ExtensionItem): string {
  if (item.implementationStatus === 'deprecated' || item.status === 'deprecated') {
    return '已下线'
  }
  if (item.implementationStatus === 'planned' || item.status === 'planned') {
    return '规划中'
  }
  if (item.implementationStatus === 'preview') {
    if (item.status === 'active') return '预览 · 已启用'
    if (item.status === 'disabled') return '预览 · 已关闭'
    if (item.status === 'error') return '预览 · 异常'
    return '几何预览'
  }
  if (item.implementationStatus === 'stub') {
    if (item.status === 'active') return 'Stub · 已启用'
    if (item.status === 'disabled') return 'Stub · 已关闭'
    if (item.status === 'error') return 'Stub · 异常'
    return 'Stub · 预览'
  }
  if (item.origin === 'uskill') {
    if (item.status === 'active') return 'uskill · 已启用'
    if (item.status === 'disabled') return 'uskill · 已关闭'
    return 'uskill'
  }
  if (item.origin === 'uplugin') {
    if (item.status === 'active') return 'uplugin · 已启用'
    if (item.status === 'disabled') return 'uplugin · 已关闭'
    if (item.status === 'error') return 'uplugin · 异常（可点启用重试）'
    return 'uplugin'
  }
  if (isCoreExtensionItem(item)) return '基础功能'
  if (item.runnable === false) return '规划中'
  if (item.status === 'active') return '已启用'
  if (item.status === 'error') return '异常'
  if (item.status === 'disabled') return '已关闭'
  return '可启用'
}

export function canToggleExtension(item: ExtensionItem): boolean {
  if (isCoreExtensionItem(item)) return false
  if ((item.pendingPermissions?.length ?? 0) > 0) return false
  if (item.implementationStatus === 'deprecated' || item.status === 'deprecated') return false
  if (item.origin === 'uskill' || item.origin === 'uplugin') {
    return item.status !== 'planned'
  }
  return item.runnable !== false && item.status !== 'planned'
}

export function canRemoveUserExtension(item: ExtensionItem): boolean {
  return item.origin === 'uskill' || item.origin === 'uplugin'
}

export function dispatchModeLabel(mode?: string): string {
  switch (mode) {
    case 'dispatched':
      return '对话调度'
    case 'autonomous':
      return '后台定时'
    case 'always_on':
      return '常驻'
    case 'manual':
      return '手动'
    default:
      return mode ?? '—'
  }
}
