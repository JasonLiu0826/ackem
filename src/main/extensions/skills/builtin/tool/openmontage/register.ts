// [OpenMontage] AI 视频制作 — 注册内置 Skill

import type { SkillRegistry } from '../../../registry'
import { OPENMONTAGE_MANIFEST } from './manifest'
import { openmontageSkill } from './skill'

export async function registerBuiltinOpenMontage(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(openmontageSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? 'OpenMontage Skill 注册失败')
  }

  const instance = registry.get(OPENMONTAGE_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(OPENMONTAGE_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? 'OpenMontage Skill 激活失败')
  }
}
