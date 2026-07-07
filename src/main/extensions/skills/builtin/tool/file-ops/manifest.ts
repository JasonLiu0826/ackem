import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: ['鐢ㄦ埛瑕佸湪鐧藉悕鍗曠洰褰曡鍐欏皬鏂囦欢'],
  scenarios: ['鏁寸悊绗旇銆佸鍑虹墖娈靛埌 staging'],
  summary: '鍦?file-ops-staging 鐧藉悕鍗曞唴 read/write 鏂囨湰鏂囦欢銆?,
  keywords: ['鍐欐枃浠?, '璇绘枃浠?, '淇濆瓨鍒?, '瀵煎嚭鍒?],
  personality_hint: 'neutral'
}

export const FILE_OPS_MANIFEST: SkillManifest = {
  id: 'Ackem/file-ops@0.0.1',
  name: '鏂囦欢鎿嶄綔',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '鍦ㄧ櫧鍚嶅崟 staging 鐩綍璇诲啓鏂囨湰鏂囦欢銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 15_000,
  adultModeSafe: true,
  functionDef: {
    name: 'file_ops',
    description: '鍦?Ackem 鐧藉悕鍗曠洰褰曡鍙栨垨鍐欏叆鏂囨湰鏂囦欢銆?,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '鎿嶄綔绫诲瀷', enum: ['read', 'write', 'list'] },
        path: { type: 'string', description: '鐩稿 staging 鐨勮矾寰勶紝濡?notes/todo.txt' },
        content: { type: 'string', description: 'write 鏃剁殑鏂囨湰鍐呭' }
      },
      required: ['action', 'path']
    }
  },
  tags: ['builtin', 'file-ops', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = FILE_OPS_MANIFEST.id
export const SPEC_ID = 'S-file-ops'
export const MANIFEST = FILE_OPS_MANIFEST
