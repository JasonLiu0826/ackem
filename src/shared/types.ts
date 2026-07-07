// [shared/types] 鈥?璺ㄨ繘绋嬪叡浜被鍨嬪畾涔?
// 浠呭寘鍚函绫诲瀷锛屼笉渚濊禆 Node.js 鎴?DOM API

export type PresetGender = 'female' | 'male'

export type LlmProvider = 'openai' | 'anthropic'

export type DataRootMode = 'portable' | 'localappdata'

export type ApiKeyHeaderMode = 'bearer' | 'x-api-key'

export type PersonalityConfigMode = 'manual' | 'inferred'

/** 涓讳汉寮€婧愬叚缁达紙0鈥?00锛?*/
export type UserSixDimensions = {
  E: number
  A: number
  D: number
  P: number
  N: number
  O: number
  /** 鎺ㄦ柇渚濇嵁鏂囦欢锛堢浉瀵?dataRoot锛?*/
  sourceFiles: string[]
  inferredAt: string
  summary?: string
}

/** 浼翠荆 TISOR 鎺ㄦ柇寤鸿 */
export type CompanionSuggestion = {
  T: number
  I: number
  S: number
  O: number
  R: number
  confidence: number
  rationale: string
}

/** 鐭ユ儏鍚屾剰鏂囨鐗堟湰锛岄』涓?docs/鏋舵瀯鎬昏_5_24鏇存柊.md 鍚屾 */
export const INFERENCE_CONSENT_VERSION = 1

export type AppSettings = {
  dataRootMode: DataRootMode
  llmProvider: LlmProvider
  openaiBaseUrl: string
  openaiApiKey: string
  anthropicBaseUrl: string
  anthropicApiVersion: string
  anthropicMaxTokens: number
  model: string
  timeoutMs: number
  ageConfirmed18: boolean
  adultContentMode: boolean
  /** 鎴愪汉璁板繂闅愮锛歟nhanced=鍏抽棴鎴愪汉妯″紡鍚?intimate/explicit 涓嶆敞鍏?*/
  adultPrivacyLevel?: 'standard' | 'enhanced'
  tierBDiaryDays: number
  singleFileSoftLimitBytes: number
  memoryBudgetChars: number
  companionName: string
  companionSystemHint: string
  companionGender: PresetGender
  companionAppearance?: string
  personalityPresetId: string
  /** 鎬ф牸閰嶇疆锛氭墜鍔?preset 鎴栦粠瀵煎叆鎺ㄦ柇 */
  personalityConfigMode: PersonalityConfigMode
  /** 鐭ユ儏鍚屾剰鏂囨鐗堟湰锛堟帹鏂?IPC 鏍￠獙鐢級 */
  inferenceConsentVersion: number
  apiKeyHeaderMode: ApiKeyHeaderMode
  llmExtraHeadersJson: string
  disableChatTools: boolean
  activeSessionId?: string
  /** MC Bot 涓婃杩炴帴鐨勪富鏈?*/
  mcBotHost?: string
  /** MC Bot 涓婃杩炴帴鐨勭鍙?*/
  mcBotPort?: number
  /** MC Bot 璐﹀彿鍚?*/
  mcBotUsername?: string
  /** MC 鏃ュ織鏂囦欢璺緞 */
  mcLogPath?: string
  /** 褰撳墠瑕嗙洊浼翠荆褰㈣薄鐨?skin 鎻掍欢 id锛涚┖=鍐呯疆 Canvas 鍑犱綍褰㈣薄 */
  activeCompanionSkinPluginId?: string
  /** OpenForU 涓撶敤妯″瀷锛堜笌鑱婂ぉ妯″瀷闅旂锛?*/
  openforuBaseUrl?: string
  openforuApiKey?: string
  openforuModel?: string
  openforuTemperature?: number
  openforuMaxTokens?: number
  /** Agent Core 涓诲惊鐜紱AC-0 璧烽粯璁?true */
  openforuAgentCoreEnabled?: boolean
  /** AC-1锛歛uto | deterministic | hybrid_skill | hybrid_inject */
  openforuGenerateStrategy?: import('./openforuAgentTypes').OpenForUGenerateStrategySetting
  /** 澶╂皵鎰熺煡 Skill 榛樿鍩庡競锛堢┖鍒欎娇鐢?Shanghai锛?*/
  weatherCity?: string
  // 鈹€鈹€ i18n 鈹€鈹€
  /** 鐣岄潰璇█ */
  locale?: 'zh' | 'en'
  // 鈹€鈹€ Embedding 妯″瀷閰嶇疆 鈹€鈹€
  /** 褰撳墠婵€娲荤殑鏈湴 embedding 妯″瀷 ID锛?none' = 涓嶅姞杞芥湰鍦版ā鍨?*/
  embeddingActiveModel?: 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh' | 'none'
  /** 杩滅▼ embedding API 鍦板潃锛堝彲閫夛級 */
  embeddingRemoteUrl?: string
  /** 杩滅▼ embedding 妯″瀷鍚嶏紙鍙€夛級 */
  embeddingRemoteModel?: string
  /** 寮傛澶氭秷鎭紙澶氭尝 API锛夋€诲紑鍏筹紱鍏冲垯鍥為€€鍗曡疆 + [SPLIT] */
  asyncMultiMessageEnabled?: boolean
  /** Wave0 浣跨敤鏈湴 OpenAI 鍏煎绔偣锛圤llama / LM Studio锛?*/
  localChatEnabled?: boolean
  localChatBaseUrl?: string
  localChatModel?: string
  /** Wave0 鐭彞 token 涓婇檺 */
  localChatMaxTokens?: number
  /** 鍚敤寰俊 iLink 娑堟伅閫氶亾锛堥渶宸叉壂鐮佺粦瀹氾級 */
  weixinChannelEnabled?: boolean
  /** 寰俊涓诲姩瑙﹁揪锛?h 鍙岀绌洪棽 + 杩涚▼鍦ㄧ嚎 + 闈炵潯瑙夋椂娈碉級 */
  weixinProactiveEnabled?: boolean
  /** 妗岄潰涓诲姩楠氭壈锛氶殢鏈?1/2/4/10 鍒嗛挓鍙戞秷鎭紙涓庢笎杩涘紡绌洪棽涓诲姩骞跺瓨锛岄粯璁ゅ叧锛?*/
  companionHarassEnabled?: boolean
  /** 鈹€鈹€ 鐢佃剳鍔╂墜锛堝疄楠岋級鈹€鈹€ */
  desktopAgentEnabled?: boolean
  desktopAgentRiskAccepted?: boolean
  desktopAgentAllowAppControl?: boolean
  desktopAgentAllowFileWrite?: boolean
  desktopAgentAllowDownload?: boolean
  desktopAgentAllowInstall?: boolean
  desktopAgentAllowDocumentRead?: boolean
  desktopAgentAllowDelete?: boolean
  /** 榛樿涓嬭浇鐩綍锛涚┖鍒?~/Downloads/AckemDownloads */
  desktopAgentDownloadDir?: string
  /** 杞欢鏇存柊涓嬭浇绾胯矾 */
  updateChannel?: 'auto' | 'github' | 'gitee'
  /** 鐢ㄦ埛璺宠繃鐨勭増鏈彿 */
  updateSkippedVersion?: string
  /** 涓婃妫€鏌ユ洿鏂版椂闂?ISO */
  updateLastCheckAt?: string
  /** 鈹€鈹€ Agnes 鏂囩敓鍥?鈹€鈹€ */
  agnesBaseUrl?: string
  agnesApiKey?: string
  agnesImageModel?: string
}
