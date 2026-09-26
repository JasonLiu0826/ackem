// [Auto Image] 聊天自动配图 — 注册 Workflow Skill

import type { SkillRegistry } from '../../../registry'
import { autoImageSkill } from './skill'

export async function registerBuiltinAutoImage(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(autoImageSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? 'Auto Image Skill 注册失败')
  }

  const instance = registry.get('ackem/auto-image@1.0.0')
  if (instance?.status !== 'active') {
    const act = await registry.activate('ackem/auto-image@1.0.0')
    if (!act.ok) throw new Error(act.error ?? 'Auto Image Skill 激活失败')
  }
}
