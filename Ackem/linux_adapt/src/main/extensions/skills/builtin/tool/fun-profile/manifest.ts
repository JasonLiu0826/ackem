import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 10 },
  habits: ['用户要趣味档案、小传、宠溺吐槽人设卡'],
  scenarios: ['基于已授权记忆生成娱乐向纸面卡'],
  summary: '用已授权记忆生成宠溺/调侃风趣味小传（非正式档案）。',
  keywords: ['趣味档案', '小传', '我的人设', '档案'],
  personality_hint: 'playful'
}

export const FUN_PROFILE_MANIFEST: SkillManifest = {
  id: 'ackem/fun-profile@0.0.1',
  name: '趣味档案生成',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '基于已授权记忆生成宠溺/调侃风趣味小传。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read'],
  timeoutMs: 30_000,
  adultModeSafe: true,
  functionDef: {
    name: 'generate_fun_profile',
    description: '根据已授权记忆生成趣味档案小传（娱乐向）。',
    parameters: {
      type: 'object',
      properties: {
        tone: { type: 'string', description: '宠溺 或 调侃，默认按亲密度' }
      },
      required: []
    }
  },
  tags: ['builtin', 's-09', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = FUN_PROFILE_MANIFEST.id
export const SPEC_ID = 'S-09'
export const MANIFEST = FUN_PROFILE_MANIFEST
