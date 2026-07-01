// [S-16] 计划书 — Markdown 可执行计划纸面卡

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PLAN_DOCUMENT_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: [
    '用户说「写计划书」「帮我规划」「做个计划」「排个计划」',
    '用户要可保存、可执行的 Markdown 计划（非 OpenForU 扩展设计）'
  ],
  scenarios: ['旅行/学习/项目/生活安排等需要分步计划'],
  summary: '生成 Markdown 计划书纸面卡 + 伴侣短评（不联网）。',
  keywords: ['计划', '计划书', '规划', '安排', '行程'],
  personality_hint: 'neutral'
}

export const PLAN_DOCUMENT_MANIFEST: SkillManifest = {
  id: 'ackem/plan-document@1.0.0',
  name: '计划书',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '为用户撰写可保存的 Markdown 计划书（目标、分步任务、风险与下一步）。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read'],
  timeoutMs: 120_000,
  adultModeSafe: true,
  functionDef: {
    name: 'generate_plan',
    description:
      '撰写 Markdown 计划书纸面卡。用于用户明确要求计划/规划/安排（非 Skill 扩展设计、非纯联网搜索）。',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '计划主题，从用户原话提取'
        }
      },
      required: ['topic']
    }
  },
  tags: ['builtin', 'plan', 'document', 's-16', 'core'],
  dispatch: PLAN_DOCUMENT_DISPATCH
}

export const SKILL_ID = PLAN_DOCUMENT_MANIFEST.id
export const SPEC_ID = 'S-16'
