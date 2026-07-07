import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '20:00-23:59', cooldown_minutes: 60 },
  habits: ['鐢ㄦ埛瑕佹ⅵ澧冦€佺潯鍓嶆晠浜嬨€佹槰澶滄ⅵ'],
  scenarios: ['鐢ㄨ蹇嗙鐗囨嫾鐭ⅵ澧冨彊浜?],
  summary: '鐢ㄨ繎鏈熻蹇嗕笌鎯呯华鏍囩鐢熸垚鐭ⅵ澧冩晠浜嬶紙鍒涙剰鍚戯級銆?,
  keywords: ['姊﹀', '鍋氭ⅵ', '鏄ㄥ姊?, '鐫″墠鏁呬簨'],
  personality_hint: 'dreamy'
}

export const DREAM_GENERATOR_MANIFEST: SkillManifest = {
  id: 'Ackem/dream-generator@0.0.1',
  name: '姊﹀鐢熸垚鍣?,
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '鐢ㄨ蹇嗙鐗囦笌鎯呯华鐢熸垚鐭ⅵ澧冩晠浜嬨€?,
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
    description: '鐢熸垚涓€娈电煭姊﹀/鐫″墠骞绘兂鏁呬簨銆?,
    parameters: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: '鍙€夋儏缁熀璋? }
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
