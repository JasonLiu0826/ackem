import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { SEDENTARY_REMINDER_MANIFEST } from './manifest'
import { sedentaryReminderSkill } from './skill'

/** 注册久坐提醒 Skill（W4 默认激活） */
export async function registerBuiltinSedentaryReminder(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(sedentaryReminderSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '久坐提醒 Skill 注册失败')
  }
  await ensureSkillActive(registry, SEDENTARY_REMINDER_MANIFEST.id)
}
