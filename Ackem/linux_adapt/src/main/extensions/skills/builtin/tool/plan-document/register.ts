import type { SkillRegistry } from '../../../registry'
import { PLAN_DOCUMENT_MANIFEST } from './manifest'
import { planDocumentSkill } from './skill'

export async function registerBuiltinPlanDocument(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(planDocumentSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '计划书 Skill 注册失败')
  }

  const instance = registry.get(PLAN_DOCUMENT_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(PLAN_DOCUMENT_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? '计划书 Skill 激活失败')
  }
}
