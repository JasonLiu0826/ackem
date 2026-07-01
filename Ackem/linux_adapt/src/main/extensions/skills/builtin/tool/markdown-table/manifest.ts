// [S-17] Markdown 表格 — 结构化表格纸面卡交付

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const MARKDOWN_TABLE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: [
    '用户说「列个表」「画个表格」「做成表格」「对比表」',
    '用户要求用 Markdown 表格呈现检索或整理结果'
  ],
  scenarios: ['对比、清单、数据汇总等需要表格交付'],
  summary: '将内容组织为 Markdown 表格纸面卡（常与联网检索配合）。',
  keywords: ['表格', '列表', '对比', '画表', '列个表'],
  personality_hint: 'neutral'
}

export const MARKDOWN_TABLE_MANIFEST: SkillManifest = {
  id: 'ackem/markdown-table@1.0.0',
  name: 'Markdown 表格',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '按用户要求将信息交付为 Markdown 表格（检索摘录 / 整理结果的呈现形态）。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read'],
  timeoutMs: 120_000,
  adultModeSafe: true,
  functionDef: {
    name: 'draw_markdown_table',
    description:
      '将指定主题的内容组织为 Markdown 表格纸面卡。用户明确要求表格/对比/列个表时使用；若需实时数据应配合 web_search。',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '表格主题或标题'
        }
      },
      required: ['topic']
    }
  },
  tags: ['builtin', 'table', 'markdown', 's-17', 'core'],
  dispatch: MARKDOWN_TABLE_DISPATCH
}

export const SKILL_ID = MARKDOWN_TABLE_MANIFEST.id
export const SPEC_ID = 'S-17'
