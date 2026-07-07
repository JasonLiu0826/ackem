import type { DesktopAgentSettingsSlice } from './desktopAgent'

/** 鐢佃剳鍔╂墜鑳藉姏澶勭悊鍣?鈥?鍖归厤鍚庡浣曟墽琛?*/
export type DesktopAgentCapabilityHandler =
  | 'investigate_games'
  | 'investigate_documents'
  | 'use_computer'
  | 'capability_help'

export type DesktopAgentCapabilityDef = {
  id: string
  label: string
  uiGroup: string
  handler: DesktopAgentCapabilityHandler
  /** Embedding 璺敱鐢ㄤ緥锛堢敤鎴峰彲鑳借鐨勮瘽锛?*/
  exampleQueries: string[]
  /** 鍖归厤鎴愬姛鍚庢敞鍏?LLM 鐨勬墽琛屾彁绀?*/
  routingHint: string
  /** 闇€瑕佽缃」寮€鍚墠鍙敤锛涚渷鐣ヨ〃绀洪粯璁ゅ彲鐢?*/
  requiresSetting?: keyof DesktopAgentSettingsSlice
}

export type DesktopAgentCapabilityMatch = {
  capabilityId: string
  label: string
  handler: DesktopAgentCapabilityHandler
  score: number
  matchedQuery: string
  routingHint: string
  source: 'embedding' | 'regex_fallback'
}

/**
 * 鐢佃剳鍔╂墜妯″紡鑳藉姏鐩綍锛圗mbedding 璺敱琛?+ 璁剧疆椤佃鏄庣殑鍞竴鏉ユ簮锛?
 * 鏂板鑳藉姏锛氬彧鍦ㄦ杩藉姞鏉＄洰锛屽苟鍐欏ソ exampleQueries銆?
 */
export const DESKTOP_AGENT_CAPABILITY_CATALOG: DesktopAgentCapabilityDef[] = [
  {
    id: 'investigate_games',
    label: '鏌ユ壘鏈満娓告垙',
    uiGroup: '鏈満鏌ユ壘',
    handler: 'investigate_games',
    exampleQueries: [
      '鎴戠數鑴戦噷鏈夊摢浜涙父鎴?,
      '甯垜鏌ユ煡瑁呬簡浠€涔堟父鎴?,
      'steam搴撻噷鏈変粈涔?,
      'epic涓婃湁鍝簺娓告垙',
      '浠旂粏鏌ユ壘鎴戠殑娓告垙',
      '娓告垙鍒楄〃',
      '鏈湴瀹夎浜嗗摢浜涙父鎴?
    ],
    routingHint:
      '鐢ㄦ埛瑕佹湰鏈烘父鎴忔竻鍗曘€傚厛璇?MachineMap / Investigation锛屽彧鍒楁壂鎻忚瘉鎹腑鐨勬父鎴忥紝绂佹鑱旂綉鎼滅储鎴栫紪閫犮€?
  },
  {
    id: 'investigate_documents',
    label: '鏌ユ壘鏈満鏂囨。',
    uiGroup: '鏈満鏌ユ壘',
    handler: 'investigate_documents',
    exampleQueries: [
      '妗岄潰鏈夊摢浜沺df',
      '鏂囨。鏂囦欢澶归噷鏈変粈涔坵ord',
      '鍒楀嚭涓嬭浇閲岀殑鏂囨。',
      '甯垜鎵句竴涓媝df鏂囦欢',
      '鎴戞湁鍝簺鏂囨。'
    ],
    routingHint:
      '鐢ㄦ埛瑕佹湰鏈烘枃妗ｆ竻鍗曘€傝蛋 Investigation 鏂囨。妯℃澘鎴?use_computer 鎼滅储锛屽彧寮曠敤鐪熷疄璺緞銆?
  },
  {
    id: 'browse_search',
    label: '娴忚涓庢煡鎵?,
    uiGroup: '鏂囦欢鎿嶄綔',
    handler: 'use_computer',
    exampleQueries: [
      '鍒楀嚭杩欎釜鏂囦欢澶归噷鏈変粈涔?,
      '鎼滅储鏂囦欢鍚嶅寘鍚?,
      '鎵句竴涓嬫闈笂鐨勬枃浠?,
      '鐪嬬湅鏌愪釜鐩綍',
      'grep鎼滅储鏂囦欢鍐呭'
    ],
    routingHint: '鐢?use_computer 鍒楀嚭/鎼滅储/璇诲彇锛屽姝ユ帰绱㈠悗鍐嶆眹鎬诲洖绛斻€?
  },
  {
    id: 'read_content',
    label: '璇诲彇鍐呭',
    uiGroup: '鏂囦欢鎿嶄綔',
    handler: 'use_computer',
    exampleQueries: [
      '璇讳竴涓嬭繖涓枃浠?,
      '鎵撳紑鐪嬬湅鍐呭',
      '杩欎唤pdf璇翠簡浠€涔?,
      '鎬荤粨涓€涓嬭繖涓獁ord',
      '鍥剧墖閲屾槸浠€涔?
    ],
    routingHint: '鐢?use_computer 璇诲彇鏂囨湰/鏂囨。/鍥剧墖锛屽熀浜庣湡瀹炲唴瀹瑰洖绛斻€?,
    requiresSetting: 'desktopAgentAllowDocumentRead'
  },
  {
    id: 'organize_files',
    label: '鏁寸悊涓庝慨鏀规枃浠?,
    uiGroup: '鏂囦欢鎿嶄綔',
    handler: 'use_computer',
    exampleQueries: [
      '澶嶅埗鍒?,
      '绉诲姩鍒?,
      '閲嶅懡鍚?,
      '鏂板缓鏂囦欢澶?,
      '鍐欏叆鏂囦欢',
      '鍒犻櫎杩欎釜鏂囦欢',
      '娓呯悊妗岄潰鏂囦欢',
      '甯垜娓呯悊涓嬭浇鏂囦欢澶?,
      '娓呯┖杩欎釜鐩綍閲岀殑涓存椂鏂囦欢'
    ],
    routingHint: '鐢?use_computer 鎵ц澶嶅埗/绉诲姩/鍐欏叆/鍒犻櫎锛涙瘡娆″啓鎿嶄綔闇€鐢ㄦ埛纭銆?,
    requiresSetting: 'desktopAgentAllowFileWrite'
  },
  {
    id: 'app_control',
    label: '鎺у埗搴旂敤绋嬪簭',
    uiGroup: '搴旂敤',
    handler: 'use_computer',
    exampleQueries: [
      '鎵撳紑chrome',
      '鍚姩寰俊',
      '鍏抽棴鏌愪釜杞欢',
      '鎶婄獥鍙ｅ垏鍒板墠闈?,
      '鑱氱劍搴旂敤'
    ],
    routingHint: '鐢?use_computer 鎵撳紑/鍏抽棴/鑱氱劍搴旂敤锛涢渶鐢ㄦ埛鍦ㄥ脊绐楃‘璁ゃ€?,
    requiresSetting: 'desktopAgentAllowAppControl'
  },
  {
    id: 'download_install',
    label: '涓嬭浇涓庡畨瑁?,
    uiGroup: '搴旂敤',
    handler: 'use_computer',
    exampleQueries: ['涓嬭浇鏂囦欢', '浠庨摼鎺ヤ笅杞?, '瀹夎杩欎釜杞欢', '杩愯瀹夎鍖?],
    routingHint: '鐢?use_computer 涓嬭浇鎴栬繍琛屽畨瑁呭寘锛涘繀椤?HTTPS 涓旂敤鎴风‘璁ゃ€?,
    requiresSetting: 'desktopAgentAllowDownload'
  },
  {
    id: 'import_Ackem',
    label: '瀵煎叆 Ackem',
    uiGroup: '鐭ヨ瘑搴?,
    handler: 'use_computer',
    exampleQueries: ['瀵煎叆鍒癰ritney', '鎶婅繖涓枃浠跺姞鍏ョ煡璇嗗簱', '瀵煎叆鏈湴鏂囨。'],
    routingHint: '鐢?use_computer import_to_Ackem 鎴栧厛纭璺緞鍐嶅鍏ャ€?
  },
  {
    id: 'capability_help',
    label: '鑳藉姏璇存槑',
    uiGroup: '甯姪',
    handler: 'capability_help',
    exampleQueries: [
      '鐢佃剳鍔╂墜鑳藉仛浠€涔?,
      '浣犱細浠€涔?,
      '浣犺兘甯垜鎿嶄綔鐢佃剳鍚?,
      '鏈夊摢浜涘姛鑳?,
      '鍙互鍋氫粈涔?
    ],
    routingHint: '鐢ㄨ嚜鐒朵腑鏂囦粙缁嶅綋鍓嶅凡寮€鏀剧殑鐢佃剳鍔╂墜鑳藉姏锛岀粰 1~2 涓緥瀛愶紝涓嶈鍫嗘妧鏈悕璇嶃€?
  }
]

export function getDesktopAgentCapabilityDef(id: string): DesktopAgentCapabilityDef | undefined {
  return DESKTOP_AGENT_CAPABILITY_CATALOG.find((c) => c.id === id)
}

function settingEnabled(
  settings: DesktopAgentSettingsSlice,
  key?: keyof DesktopAgentSettingsSlice
): boolean {
  if (!key) return true
  return settings[key] === true
}

/** 褰撳墠鐢ㄦ埛璁剧疆涓嬪彲鐢ㄤ簬 Embedding 璺敱鐨勮兘鍔涙潯鐩?*/
export function listRoutableDesktopAgentCapabilities(
  settings: DesktopAgentSettingsSlice
): DesktopAgentCapabilityDef[] {
  return DESKTOP_AGENT_CAPABILITY_CATALOG.filter((c) => settingEnabled(settings, c.requiresSetting))
}

/** 璁剧疆椤靛睍绀猴細鎸?uiGroup 鍒嗙粍 */
export function groupDesktopAgentCapabilitiesByUi(
  settings: DesktopAgentSettingsSlice
): Array<{ group: string; items: Array<{ label: string; enabled: boolean; detail: string }> }> {
  const map = new Map<string, Array<{ label: string; enabled: boolean; detail: string }>>()
  for (const cap of DESKTOP_AGENT_CAPABILITY_CATALOG) {
    const enabled = settingEnabled(settings, cap.requiresSetting)
    const detail =
      cap.handler === 'investigate_games' || cap.handler === 'investigate_documents'
        ? 'Embedding 鍖归厤鍚庤嚜鍔ㄦ湰鏈烘煡鎵撅紝鍐嶇敱澶фā鍨嬫暣鐞嗕竴鏉″洖澶?
        : cap.handler === 'capability_help'
          ? 'Embedding 鍖归厤鍚庣洿鎺ョ敱澶фā鍨嬩粙缁嶈兘鍔?
          : enabled
            ? 'Embedding 鍖归厤鍚庣敱澶фā鍨嬭皟鐢?use_computer 澶氭瀹屾垚'
            : '闇€鍦ㄤ笂鏂规潈闄愪腑寮€鍚搴斿紑鍏?
    const row = { label: cap.label, enabled, detail }
    const list = map.get(cap.uiGroup) ?? []
    list.push(row)
    map.set(cap.uiGroup, list)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
}

export function buildCapabilityRoutingSystemHint(match: DesktopAgentCapabilityMatch): string {
  return [
    `銆愮數鑴戝姪鎵?路 鑳藉姏璺敱銆戝凡鍖归厤锛?{match.label}锛?{match.source}锛岀浉浼煎害 ${(match.score * 100).toFixed(0)}%锛塦,
    `鍙傝€冧緥鍙ワ細${match.matchedQuery}`,
    match.routingHint
  ].join('\n')
}
