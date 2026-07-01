import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { MEDIA_CO_WATCH_MANIFEST } from './manifest'
import { mediaCoWatchSkill } from './skill'

export async function registerBuiltinMediaCoWatch(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(mediaCoWatchSkill)
  if (!reg.ok) throw new Error(reg.error ?? '共娱 Skill 注册失败')
  await ensureSkillActive(registry, MEDIA_CO_WATCH_MANIFEST.id)
}
