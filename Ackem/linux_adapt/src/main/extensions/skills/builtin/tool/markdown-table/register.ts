import type { SkillRegistry } from '../../../registry'
import { MARKDOWN_TABLE_MANIFEST } from './manifest'
import { markdownTableSkill } from './skill'

export async function registerBuiltinMarkdownTable(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(markdownTableSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? 'Markdown 表格 Skill 注册失败')
  }

  const instance = registry.get(MARKDOWN_TABLE_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(MARKDOWN_TABLE_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? 'Markdown 表格 Skill 激活失败')
  }
}
