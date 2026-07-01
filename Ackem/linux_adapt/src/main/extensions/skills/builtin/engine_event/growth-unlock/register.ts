import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { GROWTH_UNLOCK_MANIFEST } from './manifest'
import { growthUnlockSkill } from './skill'

export async function registerBuiltinGrowthUnlock(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(growthUnlockSkill)
  if (!reg.ok) throw new Error(reg.error ?? '成长解锁 Skill 注册失败')
  await ensureSkillActive(registry, GROWTH_UNLOCK_MANIFEST.id)
}
