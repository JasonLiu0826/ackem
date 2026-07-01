import type { SkillRegistry } from '../registry'

/** W4 关单：注册后默认 active（扩展中心非灰，与 diary-auto 一致） */
export async function ensureSkillActive(registry: SkillRegistry, skillId: string): Promise<void> {
  const instance = registry.get(skillId)
  if (!instance) return
  if (instance.status === 'active') return
  const act = await registry.activate(skillId)
  if (!act.ok) {
    throw new Error(act.error ?? `Skill ${skillId} 激活失败`)
  }
}
