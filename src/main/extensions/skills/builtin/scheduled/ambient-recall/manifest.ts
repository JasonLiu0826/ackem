import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const INTERVAL_MS = 6 * 60 * 60 * 1000

const DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'interval',
  time: {
    active_hours: '10:00-21:00',
    schedule: { rule: INTERVAL_MS, ruleType: 'interval_ms' }
  },
  habits: ['姘涘洿鍚堥€傛椂杞婚噺鎻愯捣涓€鏉℃巿鏉冭蹇?],
  scenarios: ['澧炲己闄即鎰燂紝榛樿淇濆畧棰戞帶'],
  summary: '浣庢鐜囦富鍔ㄥ洖蹇嗕竴鍙ワ紙闇€鏈夋巿鏉冭蹇嗭級銆?,
  keywords: ['杩樿寰?, '鍥炲繂'],
  personality_hint: 'gentle'
}

export const AMBIENT_RECALL_MANIFEST: SkillManifest = {
  id: 'Ackem/ambient-recall@0.0.1',
  name: '鍥炲繂瑙﹀彂',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '浣庢鐜囧湪鍚堥€傛皼鍥翠富鍔ㄦ彁璧蜂竴鏉¤蹇嗐€?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 's-20', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = AMBIENT_RECALL_MANIFEST.id
export const SPEC_ID = 'S-20'
export const MANIFEST = AMBIENT_RECALL_MANIFEST
