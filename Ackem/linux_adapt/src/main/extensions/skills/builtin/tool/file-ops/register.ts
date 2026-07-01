import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { FILE_OPS_MANIFEST } from './manifest'
import { fileOpsSkill } from './skill'

export async function registerBuiltinFileOps(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(fileOpsSkill)
  if (!reg.ok) throw new Error(reg.error ?? '文件操作 Skill 注册失败')
  await ensureSkillActive(registry, FILE_OPS_MANIFEST.id)
}
