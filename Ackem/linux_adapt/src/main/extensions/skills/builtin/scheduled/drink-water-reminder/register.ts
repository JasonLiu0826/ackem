import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { DRINK_WATER_REMINDER_MANIFEST } from './manifest'
import { drinkWaterReminderSkill } from './skill'

/** 注册喝水提醒 Skill（W4 默认激活） */
export async function registerBuiltinDrinkWaterReminder(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(drinkWaterReminderSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '喝水提醒 Skill 注册失败')
  }
  await ensureSkillActive(registry, DRINK_WATER_REMINDER_MANIFEST.id)
}

export { DRINK_WATER_REMINDER_MANIFEST }
