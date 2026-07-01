import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 5 },
  habits: ['用户声明重复习惯、每周/每天要做的事'],
  scenarios: ['写入程序性习惯 jsonl，供后续 CTX 引用'],
  summary: '识别习惯句并写入 procedural-memory.jsonl。',
  keywords: ['习惯', '每周', '每天', '固定', '例行'],
  personality_hint: 'neutral'
}

export const PROCEDURAL_MEMORY_MANIFEST: SkillManifest = {
  id: 'ackem/procedural-memory@0.0.1',
  name: '程序性记忆',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '记录用户重复习惯/流程到程序性记忆。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword', 'llm_function_call'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 10_000,
  adultModeSafe: true,
  functionDef: {
    name: 'record_habit',
    description: '记录用户声明的一条重复习惯或流程。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '习惯描述原文' }
      },
      required: ['text']
    }
  },
  tags: ['builtin', 's-17', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = PROCEDURAL_MEMORY_MANIFEST.id
export const SPEC_ID = 'S-17'
export const MANIFEST = PROCEDURAL_MEMORY_MANIFEST

export const HABIT_KEYWORD = /习惯|每周|每天|固定|例行|周三|周二|周一|周四|周五|周六|周日/
