import type { PluginRegistry } from '../../../registry'
import { ensurePluginActive } from '../../ensurePluginActive'
import { SCREENSHOT_MANIFEST, SCREENSHOT_PLUGIN_ID } from './manifest'

export async function registerBuiltinScreenshot(registry: PluginRegistry): Promise<void> {
  const reg = await registry.registerBuiltin(SCREENSHOT_MANIFEST, {
    onLoad: async () => ({ ok: true }),
    onUnload: async () => ({ ok: true as const })
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '截图插件注册失败')
  }
  await ensurePluginActive(registry, SCREENSHOT_PLUGIN_ID)
}
