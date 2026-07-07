// [S-16] 璁″垝涔?鈥?Markdown 鍙墽琛岃鍒掔焊闈㈠崱

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PLAN_DOCUMENT_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: [
    '鐢ㄦ埛璇淬€屽啓璁″垝涔︺€嶃€屽府鎴戣鍒掋€嶃€屽仛涓鍒掋€嶃€屾帓涓鍒掋€?,
    '鐢ㄦ埛瑕佸彲淇濆瓨銆佸彲鎵ц鐨?Markdown 璁″垝锛堥潪 OpenForU 鎵╁睍璁捐锛?
  ],
  scenarios: ['鏃呰/瀛︿範/椤圭洰/鐢熸椿瀹夋帓绛夐渶瑕佸垎姝ヨ鍒?],
  summary: '鐢熸垚 Markdown 璁″垝涔︾焊闈㈠崱 + 浼翠荆鐭瘎锛堜笉鑱旂綉锛夈€?,
  keywords: ['璁″垝', '璁″垝涔?, '瑙勫垝', '瀹夋帓', '琛岀▼'],
  personality_hint: 'neutral'
}

export const PLAN_DOCUMENT_MANIFEST: SkillManifest = {
  id: 'Ackem/plan-document@1.0.0',
  name: '璁″垝涔?,
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '涓虹敤鎴锋挵鍐欏彲淇濆瓨鐨?Markdown 璁″垝涔︼紙鐩爣銆佸垎姝ヤ换鍔°€侀闄╀笌涓嬩竴姝ワ級銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'keyword'],
  permissions: ['engine_read'],
  timeoutMs: 120_000,
  adultModeSafe: true,
  functionDef: {
    name: 'generate_plan',
    description:
      '鎾板啓 Markdown 璁″垝涔︾焊闈㈠崱銆傜敤浜庣敤鎴锋槑纭姹傝鍒?瑙勫垝/瀹夋帓锛堥潪 Skill 鎵╁睍璁捐銆侀潪绾仈缃戞悳绱級銆?,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '璁″垝涓婚锛屼粠鐢ㄦ埛鍘熻瘽鎻愬彇'
        }
      },
      required: ['topic']
    }
  },
  tags: ['builtin', 'plan', 'document', 's-16', 'core'],
  dispatch: PLAN_DOCUMENT_DISPATCH
}

export const SKILL_ID = PLAN_DOCUMENT_MANIFEST.id
export const SPEC_ID = 'S-16'
