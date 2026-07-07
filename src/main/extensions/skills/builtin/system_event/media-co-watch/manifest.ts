import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

/** Windows SMTC 鎸夐渶璇诲彇宸叉帴绾匡紱鑷姩鎯呯华鑱斿姩鐣?W8 */
export const MEDIA_CO_WATCH_IMPLEMENTATION_STATUS = 'preview' as const

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 15 },
  habits: ['鐢ㄦ埛鍦ㄥ惉姝屻€佺湅鐢靛奖銆佽拷鍓?],
  scenarios: ['鍏卞ū鍏抽敭璇?+ Windows SMTC 鏇插悕锛堝彲璇绘椂娉ㄥ叆鏍囬锛?],
  summary: 'Preview锛氬叧閿瘝瑙﹀彂锛沇in 涓?SMTC 鎸夐渶璇绘爣棰橈紝鍚﹀垯閫氱敤闄即鍙?,
  keywords: ['鍦ㄥ惉', '鍦ㄧ湅', '杩藉墽', '鐪嬬數褰?, '鍚瓕', '闊充箰'],
  personality_hint: 'playful'
}

export const MEDIA_CO_WATCH_MANIFEST: SkillManifest = {
  id: 'Ackem/media-co-watch@0.0.1',
  name: '鍏卞悓瑙傚奖/鍚瓕',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  implementationStatus: MEDIA_CO_WATCH_IMPLEMENTATION_STATUS,
  description:
    '銆怭review 路 W8 鍔犳繁銆戝叧閿瘝瑙﹀彂鍏卞ū鍙ワ紱Windows 涓婁細鎸夐渶璇诲彇 SMTC 鏇插悕/鏍囬骞跺啓鍏ュ洖澶嶏紝鏃犱細璇濇椂鐢ㄩ€氱敤闄即鍙ャ€?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 's-08', 'w5', 'preview', 'smtc', 'w8-planned'],
  dispatch: DISPATCH
}

export const SKILL_ID = MEDIA_CO_WATCH_MANIFEST.id
export const SPEC_ID = 'S-08'
export const MANIFEST = MEDIA_CO_WATCH_MANIFEST

export const MEDIA_KEYWORD = /鍦ㄥ惉|鍦ㄧ湅|杩藉墽|鐪嬬數褰眧鍚瓕|闊充箰|瑙嗛/
