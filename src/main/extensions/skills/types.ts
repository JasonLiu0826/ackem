// [extensions/skills/types] 鈥?鎶€鑳戒笓鍖虹被鍨嬪畾涔?
//
// 鎶€鑳?(Skill) 鏄?Ackem 鐨?鑳藉共娲?鍗曞厓銆備笉鍚屼簬鏍稿績寮曟搸鐨?Pre-LLM 绠＄嚎锛堣礋璐ｆ儏缁?鍏崇郴/璁板繂锛夛紝
// Skill 璐熻矗鍏蜂綋鐨勪换鍔℃墽琛岋細鎼滅储銆佹枃浠舵暣鐞嗐€佹棩绋嬫彁閱掋€佷俊鎭煡璇㈢瓑銆?
//
// Skill 涓庢牳蹇冨紩鎿庣殑鍏崇郴锛?
//   - Skill 閫氳繃 coordinator 娉ㄥ叆宸ュ叿鎻忚堪鍒?LLM context
//   - LLM 鍐冲畾鏄惁璋冪敤 Skill锛坒unction calling锛?
//   - Skill 鎵ц缁撴灉閫氳繃 ExtensionEvent 鍥炰紶缁欏紩鎿?
//   - Skill 缁濅笉鑳界洿鎺ヨ鍐?memory/銆乧ompanion/ 绛夊紩鎿庣洰褰?
//   - Skill 鐨勫壇浣滅敤锛堝鍐欐枃浠讹級闄愬埗鍦?staging/ 鍜?skills/<id>/ 鍐?
//
// Skill 绫诲瀷锛?
//   - rule       : 绾鍒欏尮閰嶏紝鏃犻渶 LLM锛堝"甯垜璁颁竴涓?鈫掑啓 memory锛?
//   - tool       : LLM function calling 瑙﹀彂锛堝 web_search, file_read锛?
//   - proactive  : 寮曟搸涓诲姩瑙﹀彂锛堝瀹氭椂鎻愰啋銆佷箙鍧愭娴嬶級
//   - workflow   : 澶氭楠ょ紪鎺掞紙濡?鏁寸悊涓嬭浇鏂囦欢澶?鈫掓壂鎻忊啋鍒嗙被鈫掓姤鍛婏級

import type {
  ExtensionManifestBase,
  ExtensionLifecycleHooks,
  EngineSnapshot,
  ExtensionEvent,
  RuntimeContext
} from '../protocols'

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Skill 绫诲瀷
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type SkillType = 'rule' | 'tool' | 'proactive' | 'workflow'

export type SkillTrigger =
  | 'manual'              // 鐢ㄦ埛鏄庣‘璋冪敤
  | 'keyword'             // 鍏抽敭璇嶅尮閰?
  | 'llm_function_call'   // LLM function calling
  | 'scheduled'           // 瀹氭椂瑙﹀彂
  | 'engine_event'        // 寮曟搸浜嬩欢瑙﹀彂锛堝鎯呯华绐佸彉銆佷俊浠讳笅闄嶏級
  | 'game_event'          // 娓告垙浜嬩欢瑙﹀彂
  | 'system_event'        // 绯荤粺浜嬩欢瑙﹀彂锛堝鍓嶅彴鍒囨崲銆佺┖闂茶秴鏃讹級

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface SkillManifest extends ExtensionManifestBase {
  category: 'skill'
  /** Skill 绫诲瀷 */
  skillType: SkillType
  /** 瑙﹀彂鏂瑰紡鍒楄〃 */
  triggers: SkillTrigger[]
  /** 瑙﹀彂鍏抽敭璇嶏紙褰?trigger 鍖呭惈 keyword 鏃讹級 */
  keywords?: string[]
  /** LLM function calling 瀹氫箟锛堝綋 trigger 鍖呭惈 llm_function_call 鏃讹級 */
  functionDef?: SkillFunctionDef
  /** 鎵€闇€鏉冮檺 */
  permissions: string[]
  /** 鎵ц瓒呮椂姣 */
  timeoutMs: number
  /** 鏄惁鍙湪鎴愪汉妯″紡涓嬩娇鐢?*/
  adultModeSafe: boolean
  /** 鍐茬獊 Skill ID 鍒楄〃锛堜笉鑳戒笌杩欎簺 Skill 鍚屾椂鎵ц锛?*/
  conflicts?: string[]
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Function Calling 瀹氫箟 鈥?鐢ㄤ簬 LLM tool use
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface SkillFunctionDef {
  /** 鍑芥暟鍚嶏紙LLM 鐪嬪埌鐨勫伐鍏峰悕锛?*/
  name: string
  /** 涓€鍙ヨ瘽鎻忚堪锛圠LM 鍒ゆ柇浣曟椂璋冪敤锛?*/
  description: string
  /** JSON Schema 鍙傛暟瀹氫箟 */
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Skill 鎵ц
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface SkillInvocation {
  /** 璋冪敤鍞竴 ID */
  invocationId: string
  /** Skill manifest id */
  skillId: string
  /** 瑙﹀彂鏂瑰紡 */
  trigger: SkillTrigger
  /** 瑙﹀彂鏉ユ簮璇︽儏 */
  triggerDetail: string
  /** LLM 浼犲叆鐨勫弬鏁帮紙浠?llm_function_call锛?*/
  args?: Record<string, unknown>
  /** 鐢ㄦ埛娑堟伅涓婁笅鏂?*/
  userMessage?: string
  /** 寮曟搸蹇収锛堝彧璇伙級 */
  snapshot: EngineSnapshot
  /** 杩愯鏃朵笂涓嬫枃锛堢敤鎴锋椿璺冦€佹椂娈点€侀櫔浼村湪鍦猴級 */
  runtime?: RuntimeContext
}

export interface SkillResult {
  /** 鏄惁鎴愬姛 */
  ok: boolean
  /** 杩斿洖缁?LLM 鐨勭粨鏋滄枃鏈?*/
  output: string
  /** 缁撴瀯鍖栨暟鎹紙鍙€夛級 */
  data?: unknown
  /** 閿欒淇℃伅 */
  error?: string
  /** 鏄惁搴斿皢缁撴灉娉ㄥ叆瀵硅瘽涓婁笅鏂?*/
  injectToContext: boolean
  /** 鏄惁浜х敓寮曟搸鍓綔鐢ㄤ簨浠?*/
  events: ExtensionEvent[]
  /** 鎵ц鑰楁椂姣 */
  durationMs: number
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Skill 瀹炰緥
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type SkillStatus = 'planned' | 'installed' | 'active' | 'disabled' | 'error'

export interface SkillInstance {
  manifest: SkillManifest
  status: SkillStatus
  installedAt: string
  lastError?: string
  /** 鎵ц璁℃暟 */
  executionCount: number
  /** 鏈€鍚庢墽琛屾椂闂?*/
  lastExecutedAt?: string
  hooks: ExtensionLifecycleHooks
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Skill 寮€鍙戞帴鍙?鈥?寮€鍙戣€呭疄鐜版鎺ュ彛鏉ュ垱寤?Skill
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface SkillHandler {
  /** Skill 娓呭崟 */
  readonly manifest: SkillManifest

  /** 鎵ц鎶€鑳?*/
  execute(invocation: SkillInvocation): Promise<SkillResult>

  /** 鍒ゆ柇鏄惁搴斾负姝ょ敤鎴锋秷鎭Е鍙戯紙rule 绫?Skill 鐨勬牳蹇冩柟娉曪級 */
  shouldTrigger?(userMessage: string, snapshot: EngineSnapshot): boolean

  /** 涓诲姩瑙﹀彂妫€鏌ワ紙proactive 绫?Skill 鐨勬牳蹇冩柟娉曪級 */
  shouldActivate?(snapshot: EngineSnapshot): Promise<boolean>

  /** 鑾峰彇涓诲姩瑙﹀彂鐨勮皟鐢ㄥ弬鏁?*/
  getProactiveInvocation?(snapshot: EngineSnapshot): Promise<SkillInvocation>
}
