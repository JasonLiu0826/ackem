import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { PROCEDURAL_MEMORY_MANIFEST } from './manifest'
import { proceduralMemorySkill } from './skill'

export async function registerBuiltinProceduralMemory(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(proceduralMemorySkill)
  if (!reg.ok) throw new Error(reg.error ?? '程序性记忆 Skill 注册失败')
  await ensureSkillActive(registry, PROCEDURAL_MEMORY_MANIFEST.id)
}
