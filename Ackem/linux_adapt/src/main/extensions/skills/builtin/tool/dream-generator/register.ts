import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { DREAM_GENERATOR_MANIFEST } from './manifest'
import { dreamGeneratorSkill } from './skill'

export async function registerBuiltinDreamGenerator(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(dreamGeneratorSkill)
  if (!reg.ok) throw new Error(reg.error ?? '梦境生成 Skill 注册失败')
  await ensureSkillActive(registry, DREAM_GENERATOR_MANIFEST.id)
}
