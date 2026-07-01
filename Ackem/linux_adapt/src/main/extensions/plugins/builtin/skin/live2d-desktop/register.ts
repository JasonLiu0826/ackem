import type { PluginRegistry } from '../../../registry'
import { ensurePluginActive } from '../../ensurePluginActive'
import { LIVE2D_DESKTOP_MANIFEST, LIVE2D_DESKTOP_PLUGIN_ID } from './manifest'

export async function registerBuiltinLive2dDesktop(registry: PluginRegistry): Promise<void> {
  const reg = await registry.registerBuiltin(LIVE2D_DESKTOP_MANIFEST, {
    onLoad: async () => ({ ok: true }),
    onUnload: async () => ({ ok: true as const })
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? 'Live2D 桌宠插件注册失败')
  }
  await ensurePluginActive(registry, LIVE2D_DESKTOP_PLUGIN_ID)
}
