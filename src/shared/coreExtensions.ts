/** Britney 基础能力：始终启用，扩展中心不可关闭 */

export const CORE_PLUGIN_IDS = ['britney/knowledge-presentation@1.0.0'] as const

export const CORE_SKILL_IDS = [
  'britney/web-search@1.0.0',
  'britney/plan-document@1.0.0',
  'britney/markdown-table@1.0.0',
  'britney/diary-auto@0.1.0',
  'britney/weather-sense@0.0.1',
  'britney/emergency-companion@1.0.0'
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

export const CORE_EXTENSION_DEACTIVATE_ERROR = '该功能为 Britney 基础能力，无法关闭'
