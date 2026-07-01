import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { LIGHT_SCHEDULE_MANIFEST } from './manifest'
import { lightScheduleSkill } from './skill'

export async function registerBuiltinLightSchedule(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(lightScheduleSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '轻量日程 Skill 注册失败')
  }
  await ensureSkillActive(registry, LIGHT_SCHEDULE_MANIFEST.id)
}
