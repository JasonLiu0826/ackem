import type { PluginRegistry } from '../../../registry'
import { ensurePluginActive } from '../../ensurePluginActive'
import { SCREEN_EFFECTS_MANIFEST, SCREEN_EFFECTS_PLUGIN_ID } from './manifest'

export async function registerBuiltinScreenEffects(registry: PluginRegistry): Promise<void> {
  const reg = await registry.registerBuiltin(SCREEN_EFFECTS_MANIFEST, {
    onLoad: async () => ({ ok: true }),
    onUnload: async () => ({ ok: true as const })
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '屏幕特效插件注册失败')
  }
  await ensurePluginActive(registry, SCREEN_EFFECTS_PLUGIN_ID)
}
