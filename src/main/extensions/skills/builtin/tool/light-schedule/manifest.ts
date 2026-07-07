// [S-12] 杞婚噺鏃ョ▼
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const LIGHT_SCHEDULE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: ['鐢ㄦ埛璇村府鎴戣涓€涓?, '鐢ㄦ埛闂粖澶╄繕鏈変粈涔堝畨鎺?],
  scenarios: ['md 娈佃惤绾ц交鏃ョ▼', '浠呬粖澶?鏄庡ぉ'],
  summary: '杞婚噺 md 鏃ョ▼澧炲垹鏌ワ紙闈炲畬鏁存棩鍘嗭級銆?,
  keywords: ['璁颁竴涓?, '瀹夋帓', '鏃ョ▼', '鎻愰啋', '寰呭姙'],
  personality_hint: 'neutral'
}

export const LIGHT_SCHEDULE_MANIFEST: SkillManifest = {
  id: 'Ackem/light-schedule@0.0.1',
  name: '杞婚噺鏃ョ▼',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: 'md 娈佃惤绾ц交鏃ョ▼锛堜粖澶?鏄庡ぉ锛夛紝闈?OS 鏃ュ巻銆?,
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
      '绠＄悊杞婚噺 md 鏃ョ▼锛歛dd 娣诲姞銆乴ist 鍒楀嚭銆乺emove 鍒犻櫎銆備粎鏀寔浠婂ぉ/鏄庡ぉ锛屽啓鍏?data/schedule/schedule.md銆?,
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
          description: '鏃ョ▼鍐呭锛坅dd/remove 鏃朵娇鐢級'
        },
        date: {
          type: 'string',
          description: 'YYYY-MM-DD锛岄粯璁や粖澶?
        },
        time: {
          type: 'string',
          description: 'HH:MM锛屽彲閫?
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
