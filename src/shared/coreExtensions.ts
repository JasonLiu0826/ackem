/** Ackem 鍩虹鑳藉姏锛氬缁堝惎鐢紝鎵╁睍涓績涓嶅彲鍏抽棴 */

export const CORE_PLUGIN_IDS = ['Ackem/knowledge-presentation@1.0.0'] as const

export const CORE_SKILL_IDS = [
  'Ackem/web-search@1.0.0',
  'Ackem/plan-document@1.0.0',
  'Ackem/markdown-table@1.0.0',
  'Ackem/diary-auto@0.1.0',
  'Ackem/weather-sense@0.0.1',
  'Ackem/emergency-companion@1.0.0'
] as const

export type CorePluginId = (typeof CORE_PLUGIN_IDS)[number]
export type CoreSkillId = (typeof CORE_SKILL_IDS)[number]

const CORE_PLUGINS = new Set<string>(CORE_PLUGIN_IDS)
const CORE_SKILLS = new Set<string>(CORE_SKILL_IDS)

export function isCorePlugin(id: string): boolean {
  return CORE_PLUGINS.has(id)
}

export function isCoreSkill(id: string): boolean {
  return CORE_SKILLS.has(id)
}

export function isCoreExtension(id: string): boolean {
  return isCorePlugin(id) || isCoreSkill(id)
}

export const CORE_EXTENSION_DEACTIVATE_ERROR = '璇ュ姛鑳戒负 Ackem 鍩虹鑳藉姏锛屾棤娉曞叧闂?
