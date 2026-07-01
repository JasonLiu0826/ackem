import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { BIRTHDAY_DETECT_MANIFEST } from './manifest'
import { birthdayDetectSkill } from './skill'

export async function registerBuiltinBirthdayDetect(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(birthdayDetectSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '生日检测 Skill 注册失败')
  }
  await ensureSkillActive(registry, BIRTHDAY_DETECT_MANIFEST.id)
}
