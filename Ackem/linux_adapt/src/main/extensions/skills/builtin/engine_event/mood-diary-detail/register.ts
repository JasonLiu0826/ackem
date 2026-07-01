import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { MOOD_DIARY_DETAIL_MANIFEST } from './manifest'
import { moodDiaryDetailSkill } from './skill'

export async function registerBuiltinMoodDiaryDetail(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(moodDiaryDetailSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '心情日记详规 Skill 注册失败')
  }
  await ensureSkillActive(registry, MOOD_DIARY_DETAIL_MANIFEST.id)
}
