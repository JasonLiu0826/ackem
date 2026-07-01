import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { LATE_NIGHT_REMINDER_MANIFEST } from './manifest'
import { lateNightReminderSkill } from './skill'

/** 注册深夜提醒 Skill（W4 默认激活） */
export async function registerBuiltinLateNightReminder(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(lateNightReminderSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '深夜提醒 Skill 注册失败')
  }
  await ensureSkillActive(registry, LATE_NIGHT_REMINDER_MANIFEST.id)
}

export { LATE_NIGHT_REMINDER_MANIFEST }
