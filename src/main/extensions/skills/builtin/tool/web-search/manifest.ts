// [S-15] 缃戦〉鎼滅储 鈥?Bing Skill manifest

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const WEB_SEARCH_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: {
    active_hours: '00:00-23:59',
    cooldown_minutes: 5
  },
  habits: [
    "鐢ㄦ埛璇?甯垜鎼?'鎼滅储涓€涓?'鏌ヤ竴涓?",
    '鐢ㄦ埛璇㈤棶闇€瑕佽仈缃戠殑瀹炴椂淇℃伅锛堟柊闂汇€佷环鏍笺€佺増鏈紱澶╂皵鐢?get_weather 澶勭悊锛?
  ],
  scenarios: [
    '鐢ㄦ埛闇€瑕佸疄鏃舵垨鑱旂綉淇℃伅',
    '鏂伴椈銆佹枃妗ｃ€佺増鏈洿鏂扮瓑鏌ヨ锛堝ぉ姘旈櫎澶栵級',
    'Companion 鑷韩鐭ヨ瘑涓嶈冻浠ュ洖绛旂殑浜嬪疄鎬ч棶棰?
  ],
  summary: '閫氳繃 Bing 鎼滅储缃戦〉鑾峰彇瀹炴椂淇℃伅锛屼緵 companion 寮曠敤鍚庡洖绛斻€?,
  keywords: ['鎼滅储', '鎼滀竴涓?, '鏌ヤ竴涓?, '鐧惧害', 'google', 'bing', '鏂伴椈', '鏈€鏂?],
  personality_hint: 'neutral'
}

export const WEB_SEARCH_MANIFEST: SkillManifest = {
  id: 'Ackem/web-search@1.0.0',
  name: '缃戦〉鎼滅储',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '閫氳繃 Bing 鎼滅储缃戦〉锛岃幏鍙栧疄鏃朵俊鎭紙鏂伴椈銆佹枃妗ｇ瓑锛涘ぉ姘旇鐢?get_weather锛?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call'],
  permissions: ['engine_read', 'network_outbound'],
  timeoutMs: 30000,
  adultModeSafe: true,
  functionDef: {
    name: 'web_search',
    description:
      '閫氳繃 Bing 鎼滅储缃戦〉鑾峰彇瀹炴椂淇℃伅銆傜敤浜庢柊闂汇€佷环鏍笺€佺増鏈€佹渶鏂颁簨浠剁瓑銆?*绂佹**鐢ㄤ簬澶╂皵鏌ヨ锛堝ぉ姘斿繀椤荤敤 get_weather锛夈€?,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '鎼滅储鍏抽敭璇嶏紝鐢?LLM 浠庣敤鎴锋剰鍥炬彁鍙栵紝灏介噺鍏蜂綋瀹屾暣'
        }
      },
      required: ['query']
    }
  },
  tags: ['builtin', 'search', 'bing', 's-15', 'core'],
  dispatch: WEB_SEARCH_DISPATCH
}

export const SKILL_ID = WEB_SEARCH_MANIFEST.id
export const SPEC_ID = 'S-15'

