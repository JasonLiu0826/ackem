// [S-17] Markdown 琛ㄦ牸 鈥?缁撴瀯鍖栬〃鏍肩焊闈㈠崱浜や粯

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const MARKDOWN_TABLE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: [
    '鐢ㄦ埛璇淬€屽垪涓〃銆嶃€岀敾涓〃鏍笺€嶃€屽仛鎴愯〃鏍笺€嶃€屽姣旇〃銆?,
    '鐢ㄦ埛瑕佹眰鐢?Markdown 琛ㄦ牸鍛堢幇妫€绱㈡垨鏁寸悊缁撴灉'
  ],
  scenarios: ['瀵规瘮銆佹竻鍗曘€佹暟鎹眹鎬荤瓑闇€瑕佽〃鏍间氦浠?],
  summary: '灏嗗唴瀹圭粍缁囦负 Markdown 琛ㄦ牸绾搁潰鍗★紙甯镐笌鑱旂綉妫€绱㈤厤鍚堬級銆?,
  keywords: ['琛ㄦ牸', '鍒楄〃', '瀵规瘮', '鐢昏〃', '鍒椾釜琛?],
  personality_hint: 'neutral'
}

export const MARKDOWN_TABLE_MANIFEST: SkillManifest = {
  id: 'Ackem/markdown-table@1.0.0',
  name: 'Markdown 琛ㄦ牸',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '鎸夌敤鎴疯姹傚皢淇℃伅浜や粯涓?Markdown 琛ㄦ牸锛堟绱㈡憳褰?/ 鏁寸悊缁撴灉鐨勫憟鐜板舰鎬侊級銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read'],
  timeoutMs: 120_000,
  adultModeSafe: true,
  functionDef: {
    name: 'draw_markdown_table',
    description:
      '灏嗘寚瀹氫富棰樼殑鍐呭缁勭粐涓?Markdown 琛ㄦ牸绾搁潰鍗°€傜敤鎴锋槑纭姹傝〃鏍?瀵规瘮/鍒椾釜琛ㄦ椂浣跨敤锛涜嫢闇€瀹炴椂鏁版嵁搴旈厤鍚?web_search銆?,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '琛ㄦ牸涓婚鎴栨爣棰?
        }
      },
      required: ['topic']
    }
  },
  tags: ['builtin', 'table', 'markdown', 's-17', 'core'],
  dispatch: MARKDOWN_TABLE_DISPATCH
}

export const SKILL_ID = MARKDOWN_TABLE_MANIFEST.id
export const SPEC_ID = 'S-17'
