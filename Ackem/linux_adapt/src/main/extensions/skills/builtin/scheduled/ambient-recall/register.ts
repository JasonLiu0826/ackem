import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { AMBIENT_RECALL_MANIFEST } from './manifest'
import { ambientRecallSkill } from './skill'

export async function registerBuiltinAmbientRecall(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(ambientRecallSkill)
  if (!reg.ok) throw new Error(reg.error ?? '回忆触发 Skill 注册失败')
  await ensureSkillActive(registry, AMBIENT_RECALL_MANIFEST.id)
}
