import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const EMERGENCY_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: {
    active_hours: '00:00-23:59',
    cooldown_minutes: 30
  },
  habits: [
    "鐢ㄦ埛璇?濂介毦鍙?'鎾戜笉浣忎簡''濂界劍铏?",
    '鐢ㄦ埛琛ㄨ揪宕╂簝銆佸鎬曘€佹儏缁け鎺х瓑闇€瑕侀櫔浼寸殑淇″彿'
  ],
  scenarios: [
    '鐢ㄦ埛鎯呯华浣庤胺銆佺劍铏戙€佸穿婧冭竟缂?,
    '鐢ㄦ埛鏄庣‘闇€瑕佸畨鎶氫笌闄即锛堥潪蹇冪悊娌荤枟锛?,
    '鐢ㄦ埛琛ㄨ揪鏃犲姏銆佸鎬曘€佺潯涓嶇潃绛?distress 淇″彿'
  ],
  summary: '搴旀€ラ櫔浼存ā寮忥細闄嶄綆鍒烘縺銆佸寮哄畨鍏ㄦ劅锛岀敤娓╂煍鐭彞闄即锛堥潪蹇冪悊娌荤枟锛夈€?,
  keywords: ['宕╂簝', '鐒﹁檻', '闅捐繃', '瀹虫€?, '鍙椾笉浜?, '鎾戜笉浣?, '濂介毦鍙?, '鐫′笉鐫€', '濂芥€?, '搴旀€?, '鎾戜笉浣?],
  personality_hint: 'gentle_care'
}

export const EMERGENCY_COMPANION_MANIFEST: SkillManifest = {
  id: 'Ackem/emergency-companion@1.0.0',
  name: '搴旀€ラ櫔浼存ā寮?,
  version: '1.0.0',
  category: 'skill',
  skillType: 'rule',
  description: '妫€娴?distress 鍏抽敭璇嶅悗杩涘叆娓╂煍搴旀€ラ櫔浼存ā寮忥紙闈炲績鐞嗘不鐤楋級锛汢ritney 鍩虹鑳藉姏锛屽缁堝惎鐢?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword', 'manual'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'companion', 's-07', 'core'],
  dispatch: EMERGENCY_DISPATCH
}

export const SKILL_ID = EMERGENCY_COMPANION_MANIFEST.id
export const SPEC_ID = 'S-07'
