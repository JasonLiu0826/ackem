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
  return `銆?{manifest.name ?? 'uPlugin'} 宸茶Е鍙戙€?{text}銆傜敤 Ackem 浼翠荆鐨勮嚜鐒惰姘斿洖搴旓紝骞惰惤瀹炶 Plugin 鏂规鎻忚堪鐨勮涓猴紙v1锛氫笂涓嬫枃娉ㄥ叆锛岄潪鐪熺郴缁熼挬瀛愶級銆俙
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
