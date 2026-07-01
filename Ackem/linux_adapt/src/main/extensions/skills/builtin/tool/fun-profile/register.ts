import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { FUN_PROFILE_MANIFEST } from './manifest'
import { funProfileSkill } from './skill'

export async function registerBuiltinFunProfile(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(funProfileSkill)
  if (!reg.ok) throw new Error(reg.error ?? '趣味档案 Skill 注册失败')
  await ensureSkillActive(registry, FUN_PROFILE_MANIFEST.id)
}
