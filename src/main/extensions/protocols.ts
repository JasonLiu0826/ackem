// [extensions/protocols] 鈥?鎵╁睍妯″潡涓庢牳蹇冨紩鎿庣殑閫氫俊鍗忚
//
// 璁捐鍘熷垯锛?
//   1. 鎵╁睍妯″潡鍙兘閫氳繃鏈枃浠跺畾涔夌殑鎺ュ彛涓庡紩鎿庝氦浜掞紝绂佹鐩存帴 import engine/ 鎴?memory/
//   2. 寮曟搸鐘舵€侀€氳繃鍙蹇収 (EngineSnapshot) 鏆撮湶锛屾墿灞曟ā鍧椾笉鑳界洿鎺ョ獊鍙樺紩鎿庡唴閮ㄧ姸鎬?
//   3. 鎵╁睍妯″潡鐨勫弽棣堥€氳繃 ExtensionEvent 鍥炰紶锛岀敱 orchestrator 鍦ㄤ笅涓€杞?Pre-LLM 涓粺涓€澶勭悊
//   4. 鎵€鏈夋墿灞曟ā鍧楃殑鏁版嵁鍐欏叆璧扮櫧鍚嶅崟璺緞锛屼笉鍙啓鍏?memory/銆乧ompanion/ 绛夊紩鎿庢潈濞佺洰褰?
//
// 鐗堟湰锛?.0.0  |  鎵╁睍寮曟搸 API 瑙?ecosystem/constants Ackem_ENGINE_API_VERSION
// 搴旂敤鐗堟湰瑙?manifest.engineVersion锛涘崗璁増鏈 manifest.engineApiVersion

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 寮曟搸鍙蹇収 鈥?鎵╁睍妯″潡鑳界湅鍒扮殑寮曟搸鐘舵€?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface EnginePersonalitySnapshot {
  presetId: string
  /** 浜旂淮浜烘牸 [0,100] */
  T: number  // 娓╂煍 Tenderness
  I: number  // 鐙珛 Independence
  S: number  // 鏁忔劅 Sensitivity
  O: number  // 寮€鏀?Openness
  R: number  // 鐞嗘€?Rationality
  tags: string[]
  /** 鍙嶅樊姣旂巼 [0,1]锛屼粎18+妯″紡 */
  hiddenRatio?: number
}

export interface EngineEmotionSnapshot {
  /** 鍥涚淮鎯呯华 [-100,100] */
  aff: number  // 鍠滅埍 Affection
  sec: number  // 瀹夊叏鎰?Security
  aro: number  // 鍞ら啋搴?Arousal
  dom: number  // 鏀厤鎰?Dominance
  primaryLabel: string
  isLocked: boolean
}

export interface EngineRelationshipSnapshot {
  stage: 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
  trust: number       // [0,100]
  rifts: number       // 瑁傜棔璁℃暟
  atmosphere: 'warm' | 'neutral' | 'cool'
  sharedEventsCount: number
  consecutivePositiveTurns: number
}

export interface EngineMemorySnapshot {
  /** 娲昏穬浜嬪疄鏁?*/
  activeFactCount: number
  /** 鏈€杩?5 鏉′簨瀹炴憳瑕侊紙渚涙墿灞曟ā鍧楀仛涓婁笅鏂囨劅鐭ワ級 */
  recentFactSummaries: string[]
  /** 鐭ヨ瘑鍥捐氨鑺傜偣鏁?*/
  kgNodeCount: number
  /** 鎯呰妭璁板繂鏉＄洰鏁?*/
  episodeCount: number
}

/** 鎵╁睍妯″潡鍙鐨勫紩鎿庡叏璨?鈥?鍙蹇収锛屼笉鍙獊鍙?*/
export interface EngineSnapshot {
  personality: EnginePersonalitySnapshot
  emotion: EngineEmotionSnapshot
  relationship: EngineRelationshipSnapshot
  memory: EngineMemorySnapshot
  /** 鎬诲璇濊疆鏁?*/
  totalTurns: number
  /** 鏄惁鎴愪汉妯″紡 */
  adultMode: boolean
  /** 蹇収鐢熸垚鏃堕棿 ISO */
  capturedAt: string
  /** 鐢ㄦ埛鏈€鍚庢椿璺?ISO锛堝璇濊疆娆℃洿鏂帮級 */
  lastActiveAt: string
  /** 褰撳墠浼氳瘽 ID */
  sessionId: string
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鎵╁睍浜嬩欢 鈥?鎵╁睍妯″潡鍚戝紩鎿庡弽棣堢殑鏍囧噯鍖栭€氶亾
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type ExtensionEventCategory = 'gamemode' | 'plugin' | 'skill'

export interface ExtensionEvent {
  /** 浜嬩欢鍞竴 ID */
  id: string
  /** 鏉ユ簮妯″潡 */
  category: ExtensionEventCategory
  /** 鏉ユ簮鎵╁睍鐨?manifest id */
  sourceId: string
  /** 浜嬩欢绫诲瀷锛堝悇妯″潡鑷畾涔夛級 */
  type: string
  /** 浜嬩欢鎼哄甫鏁版嵁 */
  payload: Record<string, unknown>
  /** 鎯呯华鎻愮ず锛氬缓璁殑鎯呯华璋冨埗鏂瑰悜锛堜粎浣滃弬鑰冿紝鐢卞紩鎿庢渶缁堝喅瀹氾級 */
  emotionHint?: {
    affDelta?: number
    secDelta?: number
    aroDelta?: number
    domDelta?: number
  }
  /** 鏄惁闇€瑕佹敞鍏ュ埌鏈疆涓婁笅鏂?*/
  injectToContext?: boolean
  /** 娉ㄥ叆鏂囨湰锛堣嫢 injectToContext=true锛?*/
  contextInjection?: string
  /** 鏃堕棿鎴?ISO */
  timestamp: string
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鎵╁睍鎿嶄綔缁撴灉 鈥?缁熶竴鐨勮繑鍥炲€兼牸寮?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface ExtensionOpResult<T = void> {
  ok: boolean
  data?: T
  error?: string
  /** 鎿嶄綔浜х敓鐨勫壇浣滅敤浜嬩欢锛堜細鑷姩閫佸叆寮曟搸锛?*/
  events?: ExtensionEvent[]
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鎵╁睍鐢熷懡鍛ㄦ湡閽╁瓙
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface ExtensionLifecycleHooks {
  /** 鎵╁睍鍔犺浇鏃惰皟鐢?*/
  onLoad?: (snapshot: EngineSnapshot) => Promise<ExtensionOpResult>
  /** 鎵╁睍鍗歌浇鏃惰皟鐢?*/
  onUnload?: () => Promise<ExtensionOpResult>
  /** 寮曟搸鐘舵€佹洿鏂板悗璋冪敤锛堟瘡杞璇濆悗瑙﹀彂锛岀敱鍗忚皟鍣ㄨ皟鐢級 */
  onEngineUpdate?: (snapshot: EngineSnapshot) => Promise<ExtensionOpResult>
  /** 鐢ㄦ埛娑堟伅鍙戦€佸墠璋冪敤锛堝彲杩斿洖棰濆鐨勪笂涓嬫枃娉ㄥ叆锛?*/
  beforeUserMessage?: (userMessage: string, snapshot: EngineSnapshot) => Promise<{
    contextInjections: string[]
  }>
  /** LLM 鍥炲鍚庤皟鐢紙鍙敤浜庡悗澶勭悊锛?*/
  afterAssistantMessage?: (assistantMessage: string, snapshot: EngineSnapshot) => Promise<ExtensionOpResult>
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鎵╁睍娓呭崟鍩虹瀛楁 鈥?鎵€鏈夋墿灞曟ā鍧楀叡鐢?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface EcosystemManifestMeta {
  /** 绛惧悕鍙戝竷鑰?id锛屼笌 trust/publishers.json 閿竴鑷?*/
  publisherId?: string
  /** ISO 绛惧悕鏃堕棿 */
  signedAt?: string
  /** 鍒嗗彂娓犻亾 */
  channel?: 'stable' | 'beta' | 'dev'
  /** 甯傚満 catalog 鏉＄洰 id锛堝彲閫夛級 */
  listingId?: string
}

export interface ExtensionManifestBase {
  /** 鍞竴鏍囪瘑锛屾牸寮忥細scope/name@version锛堝 "Ackem/mc-companion@1.0.0"锛?*/
  id: string
  /** 鏄剧ず鍚嶇О */
  name: string
  /** 鐗堟湰鍙?semver */
  version: string
  /** 鎵╁睍鍒嗙被 */
  category: ExtensionEventCategory
  /** 涓€鍙ヨ瘽鎻忚堪 */
  description: string
  /** 浣滆€?*/
  author: string
  /** 璁稿彲璇?SPDX */
  license: string
  /** 涓诲叆鍙ｆ枃浠讹紙鐩稿浜庢墿灞曞寘鏍圭洰褰曪級 */
  main: string
  /** 鏈€浣?Ackem 搴旂敤鐗堟湰瑕佹眰锛坰emver range锛屽 >=0.0.0 <1.0.0锛?*/
  engineVersion: string
  /**
   * 鎵╁睍寮曟搸 API 鍗忚鐗堟湰锛坰emver range锛屽 ^1.0.0锛夈€?
   * community/ 甯傚満鎵╁睍蹇呭～锛沚ritney/ 涓?u/ 寤鸿鏄惧紡濉啓銆?
   */
  engineApiVersion?: string
  /** 鐢熸€?marketplace 鍏冩暟鎹紙community 绛惧悕鍖咃級 */
  ecosystem?: EcosystemManifestMeta
  /** 渚濊禆鐨勫叾浠栨墿灞?id锛堝彲閫夛級 */
  dependencies?: string[]
  /** 鏍囩 */
  tags?: string[]
  /**
   * 瀹炶瀹屾垚搴︼紙FIX-026 绛夛級锛歴tub=浠呴瑙?閫氱煡绾у弽棣堬紝闈炲畬鏁磋兘鍔涖€?
   * 鎵╁睍涓績鎹鏄剧ず Stub 鏍囩锛岄伩鍏嶇敤鎴疯浠ヤ负宸插疄瑁呯湡璇煶绛夈€?
   */
  implementationStatus?: 'complete' | 'stub' | 'preview' | 'planned' | 'deprecated'
  /** 涓婚〉/浠撳簱 URL */
  homepage?: string
  /** 鎵╁睍瑙﹀彂璋冨害閰嶇疆锛圗xtension Dispatch v2.0锛?*/
  dispatch?: DispatchConfig
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Extension Dispatch v2.0 鈥?dispatch.mode 鍥涘垎娉?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type DispatchMode = 'autonomous' | 'always_on' | 'manual' | 'dispatched' | 'engine_event' | 'scheduled'

export type DispatchedSubtype =
  | 'semantic_match'
  | 'keyword_hint'
  | 'llm_function_call'
  | 'relationship_trust'
  | 'emotion_delta'
  | 'system_poll'

export type AutonomousSubtype =
  | 'scheduled'
  | 'interval'
  | 'system_event'
  | 'engine_event'

export type DispatchPersonalityHint =
  | 'encouragement'
  | 'gentle_care'
  | 'playful_tease'
  | 'neutral'
  | 'warm'
  | 'gentle'
  | 'playful'
  | 'dreamy'

export interface DispatchTimeAutonomous {
  rule: string | number
  ruleType: 'cron' | 'interval_ms' | 'daily_at'
}

export interface DispatchConfig {
  mode: DispatchMode
  subtype?: AutonomousSubtype | DispatchedSubtype
  time: {
    active_hours?: string
    cooldown_minutes?: number
    schedule?: DispatchTimeAutonomous
    manual_trigger?: boolean
  }
  habits: string[]
  scenarios: string[]
  summary: string
  keywords: string[]
  /** 淇濆簳鍚姩锛歚/鐣寗閽焋 绛夛紝鍛戒腑鍗?auto_invoke锛堜笉缁忚繃 LLM锛?*/
  slash?: string[]
  personality_hint?: DispatchPersonalityHint
}

export type DispatchDecision =
  | 'chat'
  | 'plan'
  | 'ask_plan'
  | 'auto_invoke'
  | 'ask_invoke'
  | 'silent'
  | 'evolve'
  | 'open_surface'
  | 'invoke_surface'

export type SurfaceInvokeDispatchMeta = {
  mode: 'open' | 'open_and_inject'
  skipMainChatLlm?: boolean
}

export interface DispatchResult {
  decision: DispatchDecision
  extensionId?: string
  confidence?: number
  contextInjection?: string
  emotionHint?: {
    affDelta?: number
    secDelta?: number
    aroDelta?: number
    domDelta?: number
  }
  askMessage?: string
  /** OpenForU 鏂板缓宸ヤ綔鍖哄悕绉?hint */
  planTopic?: string
  reasoning?: string
  /** Surface 鎻掍欢 invoke_surface 鏃剁殑瀹夸富绛栫暐 */
  surfaceInvoke?: SurfaceInvokeDispatchMeta
}

export interface DispatchCatalogEntry {
  id: string
  name: string
  category: ExtensionEventCategory
  status: 'planned' | 'installed' | 'active' | 'disabled' | 'error'
  dispatch: DispatchConfig
  lastTriggeredAt?: number
  rejectedInSession?: boolean
}

export type {
  RuntimeContext,
  UserRuntimeContext,
  UserEngagementLevel,
  UserActivityCategory,
  ActivityTense,
  UserActivityContext
} from '../context/types'
export { buildRuntimeContext } from '../context/runtimeContext'
export { buildRuntimeContextHint, buildActivityHint } from '../context/runtimeHints'
export { resolveUserActivity } from '../context/userActivity'
