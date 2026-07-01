import type { PluginRegistry } from '../registry'

/** W5：注册后默认 active（与 Skill ensureSkillActive 一致） */
export async function ensurePluginActive(registry: PluginRegistry, pluginId: string): Promise<void> {
  const instance = registry.get(pluginId)
  if (!instance) return
  if (instance.status === 'active') return
  const act = await registry.activate(pluginId)
  if (!act.ok) {
    throw new Error(act.error ?? `Plugin ${pluginId} 激活失败`)
  }
}
