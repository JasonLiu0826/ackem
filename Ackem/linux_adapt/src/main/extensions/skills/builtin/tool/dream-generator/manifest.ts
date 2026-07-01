import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '20:00-23:59', cooldown_minutes: 60 },
  habits: ['用户要梦境、睡前故事、昨夜梦'],
  scenarios: ['用记忆碎片拼短梦境叙事'],
  summary: '用近期记忆与情绪标签生成短梦境故事（创意向）。',
  keywords: ['梦境', '做梦', '昨夜梦', '睡前故事'],
  personality_hint: 'dreamy'
}

export const DREAM_GENERATOR_MANIFEST: SkillManifest = {
  id: 'ackem/dream-generator@0.0.1',
  name: '梦境生成器',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '用记忆碎片与情绪生成短梦境故事。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read'],
  timeoutMs: 30_000,
  adultModeSafe: true,
  functionDef: {
    name: 'generate_dream',
    description: '生成一段短梦境/睡前幻想故事。',
    parameters: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: '可选情绪基调' }
      },
      required: []
    }
  },
  tags: ['builtin', 's-11', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = DREAM_GENERATOR_MANIFEST.id
export const SPEC_ID = 'S-11'
export const MANIFEST = DREAM_GENERATOR_MANIFEST
