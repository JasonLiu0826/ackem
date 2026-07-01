import type { SkillRegistry } from '../../registry'
import { DIARY_AUTO_MANIFEST } from './manifest'
import { diaryAutoSkill } from './skill'

/** 注册日记自动生成 Skill（默认激活，保持与旧版 23:30 行为一致） */
export async function registerBuiltinDiaryAuto(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(diaryAutoSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '日记自动生成 Skill 注册失败')
  }

  const instance = registry.get(DIARY_AUTO_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(DIARY_AUTO_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? '日记自动生成 Skill 激活失败')
  }
}
