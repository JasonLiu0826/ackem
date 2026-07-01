// [S-12] 轻量日程
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const LIGHT_SCHEDULE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: ['用户说帮我记一下', '用户问今天还有什么安排'],
  scenarios: ['md 段落级轻日程', '仅今天/明天'],
  summary: '轻量 md 日程增删查（非完整日历）。',
  keywords: ['记一下', '安排', '日程', '提醒', '待办'],
  personality_hint: 'neutral'
}

export const LIGHT_SCHEDULE_MANIFEST: SkillManifest = {
  id: 'ackem/light-schedule@0.0.1',
  name: '轻量日程',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: 'md 段落级轻日程（今天/明天），非 OS 日历。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 10000,
  adultModeSafe: true,
  functionDef: {
    name: 'light_schedule',
    description:
      '管理轻量 md 日程：add 添加、list 列出、remove 删除。仅支持今天/明天，写入 data/schedule/schedule.md。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'add | list | remove',
          enum: ['add', 'list', 'remove']
        },
        content: {
          type: 'string',
          description: '日程内容（add/remove 时使用）'
        },
        date: {
          type: 'string',
          description: 'YYYY-MM-DD，默认今天'
        },
        time: {
          type: 'string',
          description: 'HH:MM，可选'
        }
      },
      required: ['action']
    }
  },
  tags: ['builtin', 'schedule', 's-12'],
  dispatch: LIGHT_SCHEDULE_DISPATCH
}

export const SKILL_ID = LIGHT_SCHEDULE_MANIFEST.id
export const SPEC_ID = 'S-12'

export const MANIFEST = LIGHT_SCHEDULE_MANIFEST
