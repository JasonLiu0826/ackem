// [S-02] 涓撴敞妯″紡鑱斿姩
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const POLL_MS = 60_000

const FOCUS_MODE_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'system_poll',
  time: {
    active_hours: '00:00-23:59',
    schedule: {
      rule: POLL_MS,
      ruleType: 'interval_ms'
    }
  },
  habits: ['鐢ㄦ埛寮€鍚?Windows 涓撴敞鍔╂墜鎴栫郴缁熷嬁鎵?],
  scenarios: ['涓撴敞妯″紡涓?Ackem 鑷姩瀹夐潤', '閫€鍑轰笓娉ㄥ悗鎭㈠ proactive'],
  summary: '妫€娴?Windows 涓撴敞鍔╂墜鐘舵€佸苟鍚屾 globalDnd锛堟棤鐢ㄦ埛鍙娑堟伅锛夈€?,
  keywords: ['涓撴敞', '鍕挎壈', 'focus'],
  personality_hint: 'neutral'
}

export const FOCUS_MODE_SYNC_MANIFEST: SkillManifest = {
  id: 'Ackem/focus-mode-sync@0.0.1',
  name: '涓撴敞妯″紡鑱斿姩',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: 'Windows 涓撴敞鍔╂墜寮€鍚椂鑷姩 globalDnd锛屽叧闂悗鎭㈠銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled', 'system_event'],
  permissions: ['engine_read'],
  timeoutMs: 8000,
  adultModeSafe: true,
  tags: ['builtin', 'system', 's-02'],
  dispatch: FOCUS_MODE_DISPATCH
}

export const SKILL_ID = FOCUS_MODE_SYNC_MANIFEST.id
export const SPEC_ID = 'S-02'


export const FOCUS_DND_REASON = 'focus_assist'
