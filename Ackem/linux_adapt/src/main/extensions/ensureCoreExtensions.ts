import {
  CORE_PLUGIN_IDS,
  CORE_SKILL_IDS
} from '../../shared/coreExtensions'
import type { PluginRegistry } from './plugins/registry'
import type { SkillRegistry } from './skills/registry'

/** 启动时确保基础能力处于 active */
export async function ensureCoreExtensionsActive(
  plugins: PluginRegistry,
  skills: SkillRegistry
): Promise<void> {
  for (const id of CORE_PLUGIN_IDS) {
    const instance = plugins.get(id)
    if (instance && instance.status !== 'active') {
      await plugins.activate(id)
    }
  }

  for (const id of CORE_SKILL_IDS) {
    const instance = skills.get(id)
    if (instance && instance.status !== 'active') {
      await skills.activate(id)
    }
  }
}
