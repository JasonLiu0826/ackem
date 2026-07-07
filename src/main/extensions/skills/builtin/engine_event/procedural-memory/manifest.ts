import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 5 },
  habits: ['鐢ㄦ埛澹版槑閲嶅涔犳儻銆佹瘡鍛?姣忓ぉ瑕佸仛鐨勪簨'],
  scenarios: ['鍐欏叆绋嬪簭鎬т範鎯?jsonl锛屼緵鍚庣画 CTX 寮曠敤'],
  summary: '璇嗗埆涔犳儻鍙ュ苟鍐欏叆 procedural-memory.jsonl銆?,
  keywords: ['涔犳儻', '姣忓懆', '姣忓ぉ', '鍥哄畾', '渚嬭'],
  personality_hint: 'neutral'
}

export const PROCEDURAL_MEMORY_MANIFEST: SkillManifest = {
  id: 'Ackem/procedural-memory@0.0.1',
  name: '绋嬪簭鎬ц蹇?,
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '璁板綍鐢ㄦ埛閲嶅涔犳儻/娴佺▼鍒扮▼搴忔€ц蹇嗐€?,
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
    description: '璁板綍鐢ㄦ埛澹版槑鐨勪竴鏉￠噸澶嶄範鎯垨娴佺▼銆?,
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '涔犳儻鎻忚堪鍘熸枃' }
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

export const HABIT_KEYWORD = /涔犳儻|姣忓懆|姣忓ぉ|鍥哄畾|渚嬭|鍛ㄤ笁|鍛ㄤ簩|鍛ㄤ竴|鍛ㄥ洓|鍛ㄤ簲|鍛ㄥ叚|鍛ㄦ棩/
