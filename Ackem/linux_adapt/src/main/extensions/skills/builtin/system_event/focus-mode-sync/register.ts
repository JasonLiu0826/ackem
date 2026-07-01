import type { SkillRegistry } from '../../../registry'
import { ensureSkillActive } from '../../ensureSkillActive'
import { FOCUS_MODE_SYNC_MANIFEST } from './manifest'
import { focusModeSyncSkill } from './skill'

export async function registerBuiltinFocusModeSync(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(focusModeSyncSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '专注模式联动 Skill 注册失败')
  }
  await ensureSkillActive(registry, FOCUS_MODE_SYNC_MANIFEST.id)
}
