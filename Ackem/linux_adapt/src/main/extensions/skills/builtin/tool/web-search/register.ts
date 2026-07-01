// [S-15] 网页搜索 — 注册内置 Skill

import type { SkillRegistry } from '../../../registry'
import { WEB_SEARCH_MANIFEST } from './manifest'
import { webSearchSkill } from './skill'

export async function registerBuiltinWebSearch(registry: SkillRegistry): Promise<void> {
  // 清理旧占位版本（无 functionDef，会导致 findByFunctionName 匹配失败）
  if (registry.get('ackem/web-search@0.0.1')) {
    await registry.unregister('ackem/web-search@0.0.1')
  }

  const reg = await registry.register(webSearchSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '网页搜索 Skill 注册失败')
  }

  const instance = registry.get(WEB_SEARCH_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(WEB_SEARCH_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? '网页搜索 Skill 激活失败')
  }
}
