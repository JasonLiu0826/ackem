// [Agnes Image] AI 图片生成 — 注册内置 Skill

import type { SkillRegistry } from '../../../registry'
import { AGNES_IMAGE_MANIFEST } from './manifest'
import { agnesImageSkill } from './skill'

export async function registerBuiltinAgnesImage(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(agnesImageSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? 'Agnes Image Skill 注册失败')
  }

  const instance = registry.get(AGNES_IMAGE_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(AGNES_IMAGE_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? 'Agnes Image Skill 激活失败')
  }
}
