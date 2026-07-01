// [desktop-companion/register] — 注册内置桌面陪伴插件

import type { PluginRegistry } from '../../registry'
import { DESKTOP_COMPANION_MANIFEST, DESKTOP_COMPANION_PLUGIN_ID } from './manifest'

export async function registerBuiltinDesktopCompanion(registry: PluginRegistry): Promise<void> {
  const reg = await registry.registerBuiltin(DESKTOP_COMPANION_MANIFEST, {
    onLoad: async () => ({ ok: true }),
    onUnload: async () => ({ ok: true as const })
  })

  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '桌面陪伴插件注册失败')
  }

  const instance = registry.get(DESKTOP_COMPANION_PLUGIN_ID)
  if (instance && instance.status !== 'active') {
    const act = await registry.activate(DESKTOP_COMPANION_PLUGIN_ID)
    if (!act.ok) throw new Error(act.error ?? '桌面陪伴插件激活失败')
  }
}
