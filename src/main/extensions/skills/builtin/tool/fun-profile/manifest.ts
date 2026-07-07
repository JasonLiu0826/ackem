import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 10 },
  habits: ['鐢ㄦ埛瑕佽叮鍛虫。妗堛€佸皬浼犮€佸疇婧哄悙妲戒汉璁惧崱'],
  scenarios: ['鍩轰簬宸叉巿鏉冭蹇嗙敓鎴愬ū涔愬悜绾搁潰鍗?],
  summary: '鐢ㄥ凡鎺堟潈璁板繂鐢熸垚瀹犳汉/璋冧緝椋庤叮鍛冲皬浼狅紙闈炴寮忔。妗堬級銆?,
  keywords: ['瓒ｅ懗妗ｆ', '灏忎紶', '鎴戠殑浜鸿', '妗ｆ'],
  personality_hint: 'playful'
}

export const FUN_PROFILE_MANIFEST: SkillManifest = {
  id: 'Ackem/fun-profile@0.0.1',
  name: '瓒ｅ懗妗ｆ鐢熸垚',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '鍩轰簬宸叉巿鏉冭蹇嗙敓鎴愬疇婧?璋冧緝椋庤叮鍛冲皬浼犮€?,
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
    description: '鏍规嵁宸叉巿鏉冭蹇嗙敓鎴愯叮鍛虫。妗堝皬浼狅紙濞变箰鍚戯級銆?,
    parameters: {
      type: 'object',
      properties: {
        tone: { type: 'string', description: '瀹犳汉 鎴?璋冧緝锛岄粯璁ゆ寜浜插瘑搴? }
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
