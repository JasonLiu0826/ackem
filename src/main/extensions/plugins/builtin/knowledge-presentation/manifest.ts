// 涓?manifest.json 鍚屾锛涙墦鍖呰繘 out/main 鍚庝笉鍐嶄緷璧栫鐩樹笂鐨?json 鏂囦欢
import type { PluginManifest } from '../../types'
import type { DispatchConfig } from '../../../protocols'

const KNOWLEDGE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: {
    active_hours: '08:00-23:00',
    cooldown_minutes: 10
  },
  habits: [
    "鐢ㄦ埛璇?鏁寸悊涓€涓?'甯垜姊崇悊''鐭ヨ瘑鍗?",
    '鐢ㄦ埛鎻愬嚭闇€瑕佺郴缁熸€ц瑙ｆ垨鏁寸悊鏌愪釜涓婚'
  ],
  scenarios: [
    '鐢ㄦ埛甯屾湜 companion 鏁寸悊鏌愪富棰樼煡璇?,
    '瀛︿範/澶嶄範鍦烘櫙涓嬬殑缁撴瀯鍖栬緭鍑?,
    '鐢ㄦ埛鏄惧紡瑕佹眰绾搁潰鍗℃垨鐭ヨ瘑姊崇悊'
  ],
  summary: '澶фā鍨嬬煡璇嗘暣鐞嗙焊闈㈠崱 + 浼翠荆鐭瘎锛堜笉鑱旂綉銆佹棤鍙傝€冮摼鎺ワ級銆?,
  keywords: ['鏁寸悊', '姊崇悊', '鐭ヨ瘑', '璁茶В', '绉戞櫘', '鏄粈涔?, '浠嬬粛涓€涓?, '鎬荤粨'],
  personality_hint: 'gentle_care'
}

export const KNOWLEDGE_PRESENTATION_MANIFEST: PluginManifest = {
  id: 'Ackem/knowledge-presentation@1.0.0',
  name: '鐭ヨ瘑鏁寸悊',
  version: '1.0.0',
  category: 'plugin',
  pluginType: 'tool',
  description:
    '澶фā鍨嬬煡璇嗘暣鐞嗙焊闈㈠崱 + 浼翠荆鐭瘎锛堜笉鑱旂綉銆佹棤鍙傝€冮摼鎺ワ級锛汢ritney 鍩虹鑳藉姏锛屽缁堝惎鐢?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'plugin.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['engine_read'],
  fallbackPermissions: ['readonly'],
  tags: ['knowledge', 'builtin', 'llm', 'core'],
  dispatch: KNOWLEDGE_DISPATCH
}
