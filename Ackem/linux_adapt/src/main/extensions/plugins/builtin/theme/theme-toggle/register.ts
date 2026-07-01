import type { PluginRegistry } from '../../../registry'
import { ensurePluginActive } from '../../ensurePluginActive'
import { THEME_TOGGLE_MANIFEST, THEME_TOGGLE_PLUGIN_ID } from './manifest'

export async function registerBuiltinThemeToggle(registry: PluginRegistry): Promise<void> {
  const reg = await registry.registerBuiltin(THEME_TOGGLE_MANIFEST, {
    onLoad: async () => ({ ok: true }),
    onUnload: async () => ({ ok: true as const })
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '主题切换插件注册失败')
  }
  await ensurePluginActive(registry, THEME_TOGGLE_PLUGIN_ID)
}
