import type { ExtensionLifecycleHooks } from '../protocols'
import type { PluginManifest } from '../plugins/types'
import type { ExtensionSurfaceConfig } from '../../../shared/extensionSurface'

export type UpluginMeta = {
  version: string
  injectTemplate: string
  generatedBy?: string
  grantedPermissions?: string[]
  surface?: ExtensionSurfaceConfig
}

export function buildUpluginInjectTemplate(
  manifest: { name?: string; description?: string },
  behavior: string
): string {
  const text = behavior.trim() || manifest.description || ''
  return `【${manifest.name ?? 'uPlugin'} 已触发】${text}。用 Ackem 伴侣的自然语气回应，并落实该 Plugin 方案描述的行为（v1：上下文注入，非真系统钩子）。`
}

export function createUpluginLifecycleHooks(
  _manifest: PluginManifest,
  meta: UpluginMeta
): ExtensionLifecycleHooks {
  const injection = meta.injectTemplate.trim()
  return {
    beforeUserMessage: async () => ({
      contextInjections: injection ? [injection] : []
    })
  }
}
