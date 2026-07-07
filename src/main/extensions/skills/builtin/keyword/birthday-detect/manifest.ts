// [S-13] 鐢ㄦ埛鐢熸棩妫€娴?
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const BIRTHDAY_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 60 },
  habits: ['鐢ㄦ埛鎻愬埌鐢熸棩鎴栧叿浣撴湀鏃?],
  scenarios: ['瑙ｆ瀽骞惰浣忕敓鏃?, '骞傜瓑涓嶉噸澶嶈褰?],
  summary: '妫€娴嬪璇濅腑鐨勭敓鏃ヤ俊鎭苟璁板叆涓婁笅鏂囷紙闈?OS 鏃ュ巻锛夈€?,
  keywords: ['鐢熸棩', 'birthday', '鐢熸棩鏈?, '璇炶景'],
  personality_hint: 'gentle_care'
}

export const BIRTHDAY_DETECT_MANIFEST: SkillManifest = {
  id: 'Ackem/birthday-detect@0.0.1',
  name: '鐢ㄦ埛鐢熸棩妫€娴?,
  version: '0.0.1',
  category: 'skill',
  skillType: 'rule',
  description: '瀵硅瘽涓娴嬬敓鏃ヤ俊鎭苟纭璁颁綇銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'memory', 's-13'],
  dispatch: BIRTHDAY_DISPATCH
}

export const SKILL_ID = BIRTHDAY_DETECT_MANIFEST.id
export const SPEC_ID = 'S-13'

export const MANIFEST = BIRTHDAY_DETECT_MANIFEST
