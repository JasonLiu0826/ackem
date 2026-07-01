import type { SkillRegistry } from '../../registry'
import { ensureSkillActive } from '../ensureSkillActive'
import { OFFLINE_THOUGHT_MANIFEST } from './manifest'
import { offlineThoughtSkill } from './skill'

export async function registerBuiltinOfflineThought(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(offlineThoughtSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '离线思绪 Skill 注册失败')
  }
  await ensureSkillActive(registry, OFFLINE_THOUGHT_MANIFEST.id)
}
