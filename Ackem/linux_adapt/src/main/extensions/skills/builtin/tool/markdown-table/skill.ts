// [S-17] Markdown 表格 Skill — 活动标记 + 可选独立表格生成

import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { MARKDOWN_TABLE_MANIFEST } from './manifest'

/** Skill 被调度（含检索摘录内嵌表格阶段）时的占位执行结果 */
export async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const topic =
    (typeof invocation.args?.topic === 'string' ? invocation.args.topic : '').trim() ||
    invocation.userMessage?.trim() ||
    '表格'

  return {
    ok: true,
    output: '',
    data: { topic, phase: invocation.triggerDetail || 'draw' },
    injectToContext: false,
    events: [],
    durationMs: Date.now() - start
  }
}

export const markdownTableSkill: SkillHandler = {
  manifest: MARKDOWN_TABLE_MANIFEST,
  execute
}
